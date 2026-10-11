import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { StormProvider } from "./state.jsx";
import "./index.css";

// Shows any crash on screen instead of a blank page.
class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return <pre style={{ color: "#fda4af", padding: 24, whiteSpace: "pre-wrap" }}>{String(this.state.err.stack || this.state.err)}</pre>;
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <Boundary><BrowserRouter><StormProvider><App /></StormProvider></BrowserRouter></Boundary>
);
