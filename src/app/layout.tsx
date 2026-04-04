import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PPL Dance Tool API',
  description: 'kie.ai motion control; Vercel Blob for videos, /tmp JSON for job status',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
