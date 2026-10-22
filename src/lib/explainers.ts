// Plain-language explanations behind the info icons, with a link to the matching Methodology section.

export interface Explainer {
  title: string;
  body: string;
  /** Methodology page anchor. */
  anchor: string;
  /** Question sent to the assistant from "Ask the assistant". */
  ask: string;
}

export const EXPLAINERS = {
  score: {
    title: '3x Opportunity Score',
    body: 'A 0-100 score for how well a stock fits the profile of past big winners. It blends 8 weighted factors: Growth (20%), Valuation upside (18%), Momentum (15%), Quality (12%), Catalysts (12%), Market position (10%), Risk & volatility (8%) and Market regime fit (5%). 70+ is strong, under 40 is weak. It is a research starting point, not a prediction.',
    anchor: 'dimensions',
    ask: 'How exactly is the 3x Opportunity Score calculated?',
  },
  risk: {
    title: 'Risk score',
    body: 'A separate 0-100 score where higher means riskier, built from volatility, beta, debt, cash runway, company size and profitability. Low 0-29, medium 30-54, high 55-74, extreme 75+. A stock can score high on opportunity and on risk at the same time.',
    anchor: 'risk',
    ask: 'How is the risk score calculated and how should I read it next to the 3x score?',
  },
  confidence: {
    title: 'Confidence',
    body: 'How much of the score is backed by real data. High when 85%+ of the weight has data, medium at 65-85%, low below 65%. Low-confidence scores rest on fewer inputs.',
    anchor: 'dimensions',
    ask: 'What does score confidence mean?',
  },
  scoreHistory: {
    title: 'Score history',
    body: 'Each point is a score snapshot recorded after a data refresh. A rising line means the fundamentals, valuation or momentum behind the score are improving.',
    anchor: 'backtesting',
    ask: 'How should I read the score history chart?',
  },
  cases: {
    title: 'Bull, neutral and bear cases',
    body: 'Scenarios built only from the data this stock has: the bull case from its strongest factors (60+), the bear case from its weakest (under 45) and main risks. They describe possibilities, never a recommendation.',
    anchor: 'cases',
    ask: 'How are the bull, neutral and bear cases generated?',
  },
  topOpportunities: {
    title: 'Top opportunities',
    body: 'The highest 3x scores in the view you selected (your stocks, the S&P 500 or everything tracked), with the score change since the last snapshot.',
    anchor: 'overview',
    ask: 'How are top opportunities chosen?',
  },
  movers: {
    title: 'Score movers',
    body: 'Stocks whose 3x score changed the most since the previous snapshot. Big gains often follow better growth, valuation or momentum data; big drops are worth a closer look.',
    anchor: 'overview',
    ask: 'What makes a stock show up in score movers?',
  },
  heatmap: {
    title: 'Sector and market-cap heat map',
    body: 'Average 3x score for each sector and company size. Darker cells mean higher scores, so you can see where opportunity is concentrated. Click a cell to explore those stocks.',
    anchor: 'dimensions',
    ask: 'How do I read the sector and market-cap heat map?',
  },
  presets: {
    title: 'Preset screens',
    body: 'Ready-made strategies applied to scored stocks: Highest 3x, Best risk-adjusted (score discounted by risk), Highest momentum, Most undervalued, Profitable compounders, Oversold quality, New score breakouts (+5 points) and Lower risk. Each card says its exact rule.',
    anchor: 'presets',
    ask: 'Explain each preset screen and when I would use it.',
  },
  regime: {
    title: 'Market regime',
    body: 'A daily read of the overall market (risk-on, neutral or risk-off) from VIX, Treasury yields, SPY trend, small-cap and Nasdaq strength and sector strength. How well each stock fits it is 5% of the 3x score.',
    anchor: 'regime',
    ask: 'What is the market regime and how does it affect scores?',
  },
  backtest: {
    title: 'Score backtest',
    body: 'Checks how stocks in each score band actually performed afterwards, using only scores recorded at the time, entering at the next close and comparing with SPY. History is short, so treat results as early evidence, not proof.',
    anchor: 'backtesting',
    ask: 'How does the score backtest work and how reliable is it?',
  },
  overview: {
    title: 'Overview numbers',
    body: 'Quick stats for the stocks in your current view: the top candidate (highest 3x score), the average risk score, whether the data is live or placeholder seed data, and the average score by sector.',
    anchor: 'overview',
    ask: 'What do the overview numbers on my dashboard mean?',
  },
} satisfies Record<string, Explainer>;

export type ExplainerKey = keyof typeof EXPLAINERS;
