// import { head, post } from "aws-amplify/api";
// import { API_NAME } from "../constants";
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { ApiClientBase } from "./api-client-base";

export class TickerNewsApiClient extends ApiClientBase {
  cnf = Amplify.getConfig() ;
  wssUrl = "" ;

  ws = new WebSocket(`${this.cnf?.API?.REST?.WebSocketApi?.endpoint}}`);

  constructor() {
    super() ;
    this.getIdToken().then((value)=> {
      this.ws = new WebSocket(`${this.cnf?.API?.REST?.WebSocketApi?.endpoint}?idToken=${value}`);
      // Connection opened
      this.ws.addEventListener("open", event => {
        this.ws.send("Connection established" + event)
      });

      // Listen for messages
      this.ws.addEventListener("message", event => {
        console.log("Message from server ", event.data)
      });
    }) ;
  }


  async news(message:string): Promise<any> {
    //const headers = await this.getHeaders();
    // const restOperation = post({
    //   apiName: API_NAME,
    //   path: "/tickernews",
    //   options: {
    //     headers,
    //     body:{
    //       message: message
    //     }
    //   },
    // });

    // const response = await restOperation.response;
    // const data = (await response.body.json()) as any;

    // return data;

    console.log(this.wssUrl + ":" + message);
    this.ws.send(
      JSON.stringify({
        action: "sendmessage",
        data: message,
      })
    );

    return null;
  }
  
  protected async getIdToken() {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString();
  }
}