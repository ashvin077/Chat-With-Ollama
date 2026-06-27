import ollama


def stream_ai_reply(messages):
    try:
        stream = ollama.chat(
            model="mistral",
            messages=messages,
            stream=True
        )

        for chunk in stream:
            if "message" in chunk and "content" in chunk["message"]:
                yield chunk["message"]["content"]

    except Exception as e:
        print("AI Error:", e)
        return "AI service is temporarily unavailable. Please try again later."


def summarize_text(text):
    try:
        messages = [
            {"role": "user", "content": f"Summarize this text:\n{text}"}
        ]
        response = " "
        for chunk in stream_ai_reply(messages):
            response += chunk
        return response

    except Exception as e:
        print("AI Error", e)
        return "Cannot Summarize the text.."


def question_answer(text, question):
    try:
        messages = [
            {
                "role": "user",
                "content": (
                    "You are a question answering assistant.\n\n"
                    "Document:\n"
                    f"{text}\n\n"
                    "Question:\n"
                    f"{question}\n\n"
                    "Answer the question based ONLY on the document."
                )
            }
        ]

        response = ""
        for chunk in stream_ai_reply(messages):
            response += chunk

        return response.strip()

    except Exception as e:
        print("AI Error:", e)
        return "❌ Failed to generate answer."
