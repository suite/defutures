import express, { Response } from "express";
import passport from "passport";
import jwt, { JwtPayload } from 'jsonwebtoken';
import { KEY, LOGTAIL, OAUTH_REDIRECT_URL } from "../config/database";
import User from '../model/user';
import { WagerUser } from "../misc/types";

const router = express.Router();

const SCOPES = ['tweet.read', 'users.read'];
const SCOPES_DEID = ['socials:read', 'wallets:read'].join(" ");

router.get("/login/twitter", passport.authenticate("twitter", { scope: SCOPES }));

router.get("/login/deid", passport.authenticate("oauth2", { scope: SCOPES_DEID }));

router.get("/callback/twitter", 
    passport.authenticate('twitter', { failureRedirect: OAUTH_REDIRECT_URL, assignProperty: 'twitterUser', scope: SCOPES}), 
    async (req: any, res, next) => {
        // Ensure twitter profile has correct fields
        if(!(req.twitterUser?.username && req.twitterUser?.displayName && req.twitterUser?.id)) {
             // Redirect to frontend 
             return res.redirect(`${OAUTH_REDIRECT_URL}`);
        }

        try {
            const publicKey = getLoggedInWallet(req);

            if(!publicKey) {
                throw new Error("Could not find public key");
            }

            // Update or create user with twitter data
            const newUser = await User.findOneAndUpdate({ publicKey }, { 
                $set: {
                    publicKey,
                    twitterData: {
                        id: req.twitterUser.id,
                        username: req.twitterUser.username,
                        displayName: req.twitterUser.displayName,
                        profileImage: req.twitterUser.photos[0].value.replace("_normal", ""),
                    }
                }
            }, { upsert: true, new: true });

            // TODO: Redirect user to current page their on from req

            // Redirect to frontend 
            return res.redirect(`${OAUTH_REDIRECT_URL}`);

        } catch(err) {
            // Redirect to frontend 
            return res.redirect(`${OAUTH_REDIRECT_URL}`);
        }
});

router.get("/callback/deid", 
    passport.authenticate('oauth2', { failureRedirect: OAUTH_REDIRECT_URL, assignProperty: 'deidUser', scope: SCOPES_DEID}), 
    async (req: any, res) => {
        if(!(req.deidUser?.id)) {
            return res.redirect(`${OAUTH_REDIRECT_URL}`);
       }

       console.log("deid data", req.deidUser)

       try {
        const publicKey = getLoggedInWallet(req); // Custom function to retrieve wallet

        if(!publicKey) {
            throw new Error("Could not find public key");
        }

        // Update or create user with custom OAuth data
        const newUser = await User.findOneAndUpdate({ publicKey }, { 
            $set: {
                publicKey,
                deidData: {
                    id: req.deidUser.id,
                    username: req.deidUser.name,
                    twitterHandle: req.deidUser.socials?.twitterHandle,
                    profileImage: req.deidUser.imageUrl,
                    discordUsername: req.deidUser.socials?.discordUsername,
                    wallets: req.deidUser.wallets,
                }
            }
        }, { upsert: true, new: true });

        return res.redirect(`${OAUTH_REDIRECT_URL}`);

    } catch(err) {
        LOGTAIL.error(`Could not authenticate deid user ${err}`);
        return res.redirect(`${OAUTH_REDIRECT_URL}`);
    }
});

// Logout route
router.post("/logout/deid", async (req, res) => {
    try {
        const loggedInWallet = getLoggedInWallet(req);

        if(loggedInWallet === null) {
            return res.sendStatus(403);
        }

        await User.findOneAndUpdate({ publicKey: loggedInWallet }, { 
            $unset: {
                deidData: null
            }
        });

        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.post("/logout/twitter", async (req, res) => {
    try {
        const loggedInWallet = getLoggedInWallet(req);

        if(loggedInWallet === null) {
            return res.sendStatus(403);
        }

        const newUser = await User.findOneAndUpdate({ publicKey: loggedInWallet }, { 
            $set: {
                twitterData: null
            }
        });

        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.get("/status", async (req, res) => {
    try {
        const { publicKey } = req.query;

        const user = await User.findOne({ publicKey });

        if(!user) {
            return res.sendStatus(404);
        }

        return res.json(user);
    } catch (err) {
        return res.sendStatus(500);
    }
    
});

const getLoggedInWallet = (req: any): string | null => {
    try {
        const wallet_token = req.cookies.wallet_token;
        const data = jwt.verify(wallet_token, KEY);
        const publicKey = (data as any).publicKey;
        if(!publicKey) {
            throw new Error("Could not find public key");
        }
        return publicKey;
    } catch (err) {
        return null;
    }
}

export default router;

// https://twitter.com/i/oauth2/authorize?response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Foauth%2Fcallback%2Ftwitter&code_challenge=BMWn90w4zdpeXH49fS54GrbAQAQ5joVnbbxNurQOP0k&code_challenge_method=S256&state=4e6zyejrju3HNtkrrwkCtJQs&client_id=cEszQ2NNYUM5YVA2eE13VGY4OVI6MTpjaQ