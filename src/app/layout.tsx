import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PPL Dance Tool API',
  description: 'kie.ai + Vercel KV/Blob helpers',
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
