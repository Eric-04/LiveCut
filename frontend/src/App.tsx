import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import Video from "./Video";
import HomePage from "./Home";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/video" element={<Video />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
