import express from "express";
import passport from "passport";

const router = express.Router();

const SCOPES = ['tweet.read', 'users.read', 'offline.access'];

// TODO: fix middelware
router.get("/login/twitter", passport.authenticate("twitter", { scope: SCOPES }));

router.get("/callback/twitter", 
    passport.authenticate('twitter', { failureRedirect: '/', assignProperty: 'twitterUser', scope: SCOPES}), 
    (req: any, res, next) => {
        console.log("Twitter user:", req.twitterUser);

        req.login(req.twitterUser, (err: any) => {
            if (err) {
                return next(err);
            }

            return res.redirect('/');
        });
});

router.get("/logout", (req, res) => {
    req.logout(err => {
        if (err) {
            console.error("Error logging out", err);
        }
    });

    res.redirect('/');
});

router.get("/status", (req, res) => {
    if(req.user) {
        res.status(200).json({ loggedIn: true });
    } else {
        res.status(200).json({ loggedIn: false });
    }
    console.log(req.user)
    
});

export default router;

// https://twitter.com/i/oauth2/authorize?response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Foauth%2Fcallback%2Ftwitter&code_challenge=BMWn90w4zdpeXH49fS54GrbAQAQ5joVnbbxNurQOP0k&code_challenge_method=S256&state=4e6zyejrju3HNtkrrwkCtJQs&client_id=cEszQ2NNYUM5YVA2eE13VGY4OVI6MTpjaQ