import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import Video from "./Video";
import HomePage from "./Home";
import Edit from "./Edit";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/video" element={<Video />} />
        <Route path="/edit" element={<Edit />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
