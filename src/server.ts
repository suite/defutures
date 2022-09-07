require("dotenv").config();
import express, { NextFunction, Request, Response } from "express";
import cors from 'cors';
import cookieParser from "cookie-parser";
import { connectMongo, KEY } from './config/database';
import apiRoute from './routes/api';
import protectedRoute from './routes/protected';
import jwt from 'jsonwebtoken';

const app = express();
const port = process.env.PORT || 3001;

const CORS_ORIGIN = process.env.ORIGIN as string || 'http://localhost:3000';
 
/* THOUGHTS:
- use cloudflare
- add cancel (also cancel schedule)
- add ability to change current status (close betting)
- test betting after end date
-  wtach out for fault pubkey/sig
- send out fees to fund wallet 

- might want to think about sending placebet client side until success..
- heroku logging

- TODO: 
- airdrop to all winners
- cancel wager - airdrop back bets
- somehow log airdrop 


- add message on side/show tiwtter

- TODO: stress test wallet creation
- LOOK INTO MULTI SIG

- Handle 0 bets on either side
- Check .$, (only returns first matching element) (airdrop, setwinners) (placedBets.$)
- promise all setWinners


- test cancel
- airdrop need retry?
- add nippies metadata, add winner image
- live in reward pool check game status
- refresh game data
- websockets?



- implement game timers from backend - DONE
- verify gameData is alright - FINE
try catch around fetch -> websockets - DONE
finished airdrop message - DONE
send feeeees! - DONE


- Log tx's through disc webhook

- Change timeout for /protected - DONE
- Upgrade servers - DONE
- Make sure CORS is good - DONE
- Change RPC? - DONE
- /protected - DONE

- do mainnet test before setting up
  - RPC - SWITCH PROVIDER, UPGRADE FUNCS..?
  - hook up domain
  - get ready to upgrade servers
  - make sure fund wallet working main net
  ^ cluster op in env

  TOOD: Test on postman
*/

const authorization = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.access_token;
    if (!token) {
      return res.sendStatus(403);
    }

    try {
      const data = jwt.verify(token, KEY);
      
      return next();
    } catch {
      return res.sendStatus(403);
    }
};

(async () => {
    await connectMongo();

    const corsOpts = { credentials: true, origin: [...CORS_ORIGIN.split(',')] }

    console.log("Cors opts:", corsOpts)

    app.use(express.json());
    app.use(cors(corsOpts));
    app.use(cookieParser());

    // Public api
    app.use('/api', apiRoute);

    // Protected api
    // app.use('/protected', authorization, protectedRoute);

    // TODO REMOVE:

    app.use('/protected', protectedRoute);
    

    const server = app.listen(port, () => {
        console.log(`Example app listening on port ${port}`)
    })

    server.timeout = 240000;
})();



