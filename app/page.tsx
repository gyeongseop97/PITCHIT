export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <iframe
        title="PITCHIT"
        src="/game/index.html"
        style={{ border: 0, width: "100%", minHeight: "100vh", display: "block" }}
      />
    </main>
  );
}
