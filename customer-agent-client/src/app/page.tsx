"use client";

import { useChatStore } from "@/store/ChatStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function WelcomePage() {
  const { addChat } = useChatStore();
  const router = useRouter();

  const handleAddChat = () => {
    toast.promise(
      new Promise((resolve) => {
        const newChat = addChat();
        resolve(newChat);
      }),
      {
        loading: "Creating new chat...",
        success: (newChat: any) => {
          router.push(`/chat/${newChat.id}`);
          return "Chat created successfully!";
        },
        error: "Failed to create chat",
      },
    );
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 text-center font-sans">
      {/* Heading */}
      <h1 className="text-3xl md:text-4xl font-bold mb-4">
        CUSTOMER SUPPORT AGENT
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Multi-agent system demo by <span className="font-semibold">ROX</span>
        <br />
        (watch different agents handle different tasks)
      </p>

      {/* Steps */}
      <div className="max-w-xl text-left space-y-4 mb-8">
        <div>
          <p className="font-semibold">Step 1 →</p>
          <p className="text-muted-foreground">
            Ask for order <span className="font-medium">001</span>→ see{" "}
            <span className="font-semibold">Order Sub-Agent</span> running
          </p>
        </div>

        <div>
          <p className="font-semibold">Step 2 →</p>
          <p className="text-muted-foreground">
            Ask for a refund → see{" "}
            <span className="font-semibold">Refund Sub-Agent</span> in action
          </p>
        </div>

        <div>
          <p className="font-semibold">Step 3 →</p>
          <p className="text-muted-foreground">
            Cancel order <span className="font-medium">003</span>→ triggers{" "}
            <span className="font-semibold">HITL approval</span>{" "}
            (Human-in-the-loop)
          </p>
        </div>

        <div>
          <p className="font-semibold">What’s happening →</p>
          <p className="text-muted-foreground">
            Different specialized agents handle different tasks automatically 🚀
          </p>
        </div>
      </div>

      {/* CTA Button */}
      <button
        className="bg-primary text-primary-foreground hover:opacity-90 transition px-8 py-4 rounded-lg text-lg font-medium"
        onClick={handleAddChat}
      >
        Start Customer Chat
      </button>
    </div>
  );
}
