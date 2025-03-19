import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { USE_BROWSER_ROUTER } from "./common/constants";
import { ChatUI } from "./components/chat/chatui";
import GlobalHeader from "./components/global-header";
import FinancialDataPage from "./pages/financial-data";
import FundamentalAnalysisPage from "./pages/fundamental-analysis";
import InvestmentAnalystPage from "./pages/investment-analysis";
import InvestmentAnalystHomePage from "./pages/investment-analyst-home";
import NotFound from "./pages/not-found";
import QualitativeQnAPage from "./pages/qualitative-qna";
import TickerNewsPage from "./pages/ticker-news";
import "./styles/app.scss";

export default function App() {
  const Router = USE_BROWSER_ROUTER ? BrowserRouter : HashRouter;

  return (
    <div style={{ height: "100%" }}>
      <Router>
        <GlobalHeader />
        <div style={{ height: "56px", backgroundColor: "#000716" }}>&nbsp;</div>
        <div>
          <Routes>
            <Route index path="/" element={<InvestmentAnalystHomePage />} />
            <Route path="/tickernews" element={<TickerNewsPage />}/>
            <Route path="/fundamentalanalysis" element={<FundamentalAnalysisPage />}/>
            <Route path="/financialdata" element={<FinancialDataPage />}/>
            <Route path="/qualitativeqna" element={<QualitativeQnAPage />}/>
            <Route path="/investmentanalysis" element={<InvestmentAnalystPage />}/>
            <Route path="/chat" element={<ChatUI />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
    </div>
  );
}