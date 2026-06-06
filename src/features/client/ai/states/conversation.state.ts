export interface ConversationState {
	question: string;
	questionIndex: number;
	answer?: string | null;
	answerIsValid?: boolean;
}
