import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PPL Dance Tool API',
  description: 'kie.ai motion control + Vercel Blob (videos + job status JSON)',
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
