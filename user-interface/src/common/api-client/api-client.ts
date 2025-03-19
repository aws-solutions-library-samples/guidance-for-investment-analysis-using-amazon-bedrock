import { ChatApiClient } from "./chat-api-client";
import { TickerNewsApiClient } from "./tickernews-api-client";

export class ApiClient {
  private _chatClient: ChatApiClient | undefined;

  public get chatClient() {
    if (!this._chatClient) {
      this._chatClient = new ChatApiClient();
    }

    return this._chatClient;
  }

  private _tickerNewsClient: TickerNewsApiClient | undefined;
  public get tickerNewsClient() {
    if (!this._tickerNewsClient) {
      this._tickerNewsClient = new TickerNewsApiClient();
    }

    return this._tickerNewsClient;
  }
  
}
