"""RAG demo on 3x Hunter's own data. No extra libraries, no API key.

  python3 scripts/rag-demo.py "Is NVDA risky in 3x Hunter, and how is the risk score worked out?"

The four RAG steps, each printed with real numbers:
  1. Ingest  - pull live stocks from the 3x Hunter API and the methodology text from the repo,
               and cut them into small "chunks" (one per stock, one per methodology section).
  2. Retrieve - score every chunk against the question with BM25 (keyword relevance) and keep the top few.
  3. Augment  - paste those chunks into the prompt, numbered [1], [2], ...
  4. Generate - ask Claude (through `claude -p`, on your Claude plan) to answer ONLY from those chunks, with citations.
Then it asks the same question with no retrieved chunks, so you can see what RAG adds.
"""
import json, math, os, re, subprocess, sys, tempfile, urllib.request
from collections import Counter

API = "https://stockanalyzer-bolot1.vercel.app/api/stocks"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOP_K = 4
QUESTION = sys.argv[1] if len(sys.argv) > 1 else "Is NVDA risky in 3x Hunter, and how is the risk score worked out?"
line = lambda t: print(f"\n{'=' * 8} {t} {'=' * (60 - len(t))}")

# ---------------------------------------------------------------- 1. ingest
line("1. INGEST")
stocks = json.load(urllib.request.urlopen(API, timeout=30))
fmt = lambda v, s="": "n/a" if v is None else f"{v}{s}"
chunks = []
for s in stocks:
    chunks.append({
        "source": f"stock:{s['ticker']}",
        "text": (f"{s['ticker']} ({s['company_name']}), {s.get('sector')} / {s.get('industry')}. "
                 f"3x Opportunity Score {fmt(s.get('three_x_score'))}/100 (previous {fmt(s.get('previous_score'))}). "
                 f"Risk score {fmt(s.get('risk_score'))}/100, risk level {s.get('risk_level')}. "
                 f"Price ${fmt(s.get('current_price'))}, market cap ${fmt(round((s.get('market_cap') or 0) / 1e9, 1))}B. "
                 f"Revenue growth {fmt(s.get('revenue_growth_yoy'), '%')}, earnings growth {fmt(s.get('earnings_growth_yoy'), '%')}. "
                 f"Volatility {fmt(s.get('volatility'), '%')}, beta {fmt(s.get('beta'))}, debt/equity {fmt(s.get('debt_to_equity'))}, "
                 f"net margin {fmt(s.get('profit_margin'), '%')}. Analyst mean target ${fmt(s.get('target_mean_price'))} "
                 f"from {fmt(s.get('analyst_count'))} analysts. Data refreshed {str(s.get('last_refreshed_at') or s.get('updated_at'))[:10]}."),
    })
knowledge = open(os.path.join(REPO, "api", "_assistant-knowledge.ts")).read()
knowledge = knowledge.split("`", 1)[1].rsplit("`", 1)[0]
for sec in re.split(r"\n(?=# )", knowledge):
    sec = sec.strip()
    if sec.startswith("# "):
        title = sec.splitlines()[0][2:]
        chunks.append({"source": f"methodology:{title}", "text": sec})
n_stock = sum(c["source"].startswith("stock:") for c in chunks)
print(f"{len(stocks)} live stocks from the 3x Hunter API + {len(chunks) - n_stock} methodology sections = {len(chunks)} chunks")
print(f"example chunk -> {chunks[0]['source']}: {chunks[0]['text'][:160]}...")

# ---------------------------------------------------------------- 2. retrieve (BM25)
line("2. RETRIEVE (BM25)")
# "3x" and "hunter" are the app's own name: every chunk is about it, so they carry no signal.
STOP = set("a an and are as at be by for from how in is it its of on or the to what with does do i my this that worked out which has have more why who when where should can 3x hunter".split())
def stem(w):  # crude stemmer so risky / riskier / risks all match "risk"
    for suf in ("ier", "iest", "ies", "y", "s"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w
tok = lambda t: [stem(w) for w in re.findall(r"[a-z0-9]+", t.lower()) if w not in STOP]
q = tok(QUESTION)
print(f"question words: {q}")

def search(ids, k):
    """BM25 over just these chunks. Word rarity (idf) is measured inside this set only."""
    docs = {i: tok(chunks[i]["source"] + " " + chunks[i]["text"]) for i in ids}
    N, avg = len(docs), sum(map(len, docs.values())) / len(docs)
    df = Counter(w for d in docs.values() for w in set(d))
    idf = {w: math.log(1 + (N - n + 0.5) / (n + 0.5)) for w, n in df.items()}
    def bm25(d, k1=1.5, b=0.75):
        tf = Counter(d)
        return sum(idf.get(w, 0) * tf[w] * (k1 + 1) / (tf[w] + k1 * (1 - b + b * len(d) / avg)) for w in q if w in tf)
    hits = sorted(((bm25(d), i) for i, d in docs.items()), reverse=True)[:k]
    return [h for h in hits if h[0] > 0.01] or hits[:1]  # drop chunks that matched nothing

def show(hits):
    for rank, (score, i) in enumerate(hits, 1):
        print(f"  [{rank}] score {score:5.2f}  {chunks[i]['source']}")

# Naive: one index over everything. "risk" and "score" sit in all 568 stock chunks, so they count for almost nothing.
print("\nA) one index over all 579 chunks:")
show(search(range(len(chunks)), TOP_K))
# Fix: search each source on its own and take the best of each, so methodology words are judged among methodology.
stock_ids = [i for i, c in enumerate(chunks) if c["source"].startswith("stock:")]
method_ids = [i for i, c in enumerate(chunks) if c["source"].startswith("methodology:")]
print("\nB) per-source search (2 best stocks + 2 best methodology sections):")
show(search(stock_ids, 2) + search(method_ids, 2))
# Hybrid: tickers typed in capitals (NVDA, TSLA) are looked up exactly, so "has" can't pull in Hasbro (HAS).
by_ticker = {c["source"][6:]: i for i, c in enumerate(chunks) if c["source"].startswith("stock:")}
exact = [(99.0, by_ticker[t]) for t in dict.fromkeys(re.findall(r"\b[A-Z]{1,5}\b", QUESTION)) if t in by_ticker]
stock_hits = exact or search(stock_ids, 2)
ranked = stock_hits + search(method_ids, 2)
print("\nC) hybrid: exact ticker lookup + per-source keyword search  <- used below:")
show(ranked)

# ---------------------------------------------------------------- 3. augment
line("3. AUGMENT")
context = "\n\n".join(f"[{r}] ({chunks[i]['source']})\n{chunks[i]['text']}" for r, (_, i) in enumerate(ranked, 1))
prompt = f"""Answer the question using ONLY the numbered sources below. Cite them like [1]. If the sources don't
contain the answer, say so. Plain English, under 150 words. This is educational, not investment advice.

SOURCES
{context}

QUESTION: {QUESTION}"""
print(f"prompt is {len(prompt)} characters, carrying {TOP_K} of {len(chunks)} chunks")

# ---------------------------------------------------------------- 4. generate
def claude(text):
    with tempfile.TemporaryDirectory() as work:
        r = subprocess.run(["claude", "-p", "--model", "claude-sonnet-5-5", "--tools", "", "--no-session-persistence",
                            "--strict-mcp-config", "--disable-slash-commands", "--setting-sources", ""],
                           input=text, capture_output=True, text=True, cwd=work, timeout=300,
                           env={k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"})
    return r.stdout.strip() or r.stderr.strip()

line("4. GENERATE (with RAG)")
print(claude(prompt))
line("SAME QUESTION, NO RAG")
print(claude(f"{QUESTION}\nAnswer in under 100 words. If you don't know 3x Hunter's specific numbers, say so."))
