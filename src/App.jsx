import React from "react";
import { Routes, Route } from "react-router-dom";
import Shell from "./components/Shell.jsx";
import Overview from "./pages/Overview.jsx";
import Imagery from "./pages/Imagery.jsx";
import Prediction from "./pages/Prediction.jsx";
import Dashboard from "./pages/Dashboard.jsx"; 
import Warnings from "./pages/Warnings.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="imagery" element={<Imagery />} />
        <Route path="prediction" element={<Prediction />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="warnings" element={<Warnings />} />
      </Route>
    </Routes>
  );
}
