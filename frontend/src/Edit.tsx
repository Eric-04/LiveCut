import './Edit.css';

function Edit() {
  // Decorative buildings (no video)
  const decorativeBuildings = [
    { key: 'left1', shape: 'tall', color: '#414345' },
    { key: 'left2', shape: 'short', color: '#232526' },
    { key: 'right1', shape: 'short', color: '#232526' },
    { key: 'right2', shape: 'tall', color: '#414345' },
  ];

  // Helper for decorative building style
  const getBuildingStyle = (shape: string) => {
    if (shape === 'tall') return { height: '48vh' };
    if (shape === 'short') return { height: '32vh' };
    return {};
  };

  return (
    <div className="video-page">
      <h1 className="video-title">LiveCut</h1>
      <div className="video-container">
        {/* Left decorative buildings */}
        {decorativeBuildings.slice(0,2).map(b => (
          <div className="building" key={b.key} style={getBuildingStyle(b.shape)}>
            <div className="building-shape" style={{ background: b.color }}></div>
            <div className="building-window"></div>
          </div>
        ))}
        {/* Video buildings */}
        {["video1.mp4", "video2.mp4", "video3.mp4"].map((src, _) => (
          <div className="building" key={src}>
            <div className="building-shape"></div>
            <div className="building-window"></div>
            <video className="city-video" src={`/videos/${src}`} controls autoPlay loop muted playsInline />
          </div>
        ))}
        {/* Right decorative buildings */}
        {decorativeBuildings.slice(2).map(b => (
          <div className="building" key={b.key} style={getBuildingStyle(b.shape)}>
            <div className="building-shape" style={{ background: b.color }}></div>
            <div className="building-window"></div>
          </div>
        ))}
      </div>
      <div className="city-skyline">
        <svg viewBox="0 0 1440 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="120" width="80" height="80" fill="#232526" />
          <rect x="90" y="80" width="60" height="120" fill="#414345" />
          <rect x="160" y="100" width="40" height="100" fill="#232526" />
          <rect x="210" y="60" width="70" height="140" fill="#414345" />
          <rect x="290" y="130" width="50" height="70" fill="#232526" />
          <rect x="350" y="110" width="60" height="90" fill="#414345" />
          <rect x="420" y="90" width="40" height="110" fill="#232526" />
          <rect x="470" y="140" width="80" height="60" fill="#414345" />
          <rect x="560" y="100" width="60" height="100" fill="#232526" />
          <rect x="630" y="120" width="50" height="80" fill="#414345" />
          <rect x="690" y="80" width="70" height="120" fill="#232526" />
          <rect x="770" y="130" width="60" height="70" fill="#414345" />
          <rect x="840" y="110" width="40" height="90" fill="#232526" />
          <rect x="890" y="60" width="80" height="140" fill="#414345" />
          <rect x="980" y="100" width="60" height="100" fill="#232526" />
          <rect x="1050" y="120" width="50" height="80" fill="#414345" />
          <rect x="1110" y="80" width="70" height="120" fill="#232526" />
          <rect x="1190" y="130" width="60" height="70" fill="#414345" />
          <rect x="1260" y="110" width="40" height="90" fill="#232526" />
          <rect x="1310" y="140" width="130" height="60" fill="#414345" />
        </svg>
      </div>
    </div>
  );
}

export default Edit;