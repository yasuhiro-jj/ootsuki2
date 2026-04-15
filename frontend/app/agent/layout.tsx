import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'おおつきチャットボット（Notion Agent）',
  description: 'Notion Custom Agent を主役としたチャットです。',
};

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
