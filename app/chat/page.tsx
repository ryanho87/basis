import { PageBody, PageHeader } from "@/components/page-header";
import { ChatInterface } from "@/components/chat-interface";

export default function ChatPage() {
  return (
    <div>
      <PageHeader
        title="Chat"
        description="Your financial planning assistant — knows your numbers"
      />
      <PageBody>
        <ChatInterface />
      </PageBody>
    </div>
  );
}
