require("dotenv").config();
import express from "express";
import cors from 'cors';
import cookieParser from "cookie-parser";
import { connectMongo, KEY } from './config/database';
import apiRoute from './routes/api';
import protectedRoute from './routes/protected';
import jwt from 'jsonwebtoken';
import { PublicKey } from "@solana/web3.js";

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

- Log tx's through disc webhook
- add message on side/show tiwtter

- TODO: stress test wallet creation
- LOOK INTO MULTI SIG
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

    const corsOpts = { credentials: true, origin: CORS_ORIGIN }

    console.log("Cors opts:", corsOpts)

    app.use(express.json());
    app.use(cors(corsOpts));
    app.use(cookieParser());

    // Public api
    app.use('/api', apiRoute);

    // Protected api
    app.use('/protected', authorization, protectedRoute);

    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`)
    })
})();



