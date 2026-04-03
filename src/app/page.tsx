export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 560 }}>
      <h1>ppl-dance-tool</h1>
      <p>API-only app. Routes:</p>
      <ul>
        <li>
          <code>POST /api/generate</code> —{' '}
          <code>{'{ characterImageUrl, videoUrl }'}</code>
        </li>
        <li>
          <code>POST /api/callback</code> — kie.ai webhook
        </li>
        <li>
          <code>GET /api/status?taskId=…</code>
        </li>
        <li>
          <code>GET /api/videos</code>
        </li>
        <li>
          <code>POST /api/upload-video</code> — multipart <code>file</code>
        </li>
      </ul>
    </main>
  );
}
