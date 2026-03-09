import { createClient } from "tinacms/dist/client";
import { queries } from "./types";
export const client = createClient({ cacheDir: '/home/snlr/code/sunnyvale-onions-and-honey/tina/__generated__/.cache/1773030927303', url: 'http://localhost:4001/graphql', token: 'xxx', queries,  });
export default client;
  