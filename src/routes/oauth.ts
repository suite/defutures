import express from "express";
import passport from "passport";

const router = express.Router();

router.get("/callback/twitter", 
    passport.authenticate('twitter', { failureRedirect: '/', assignProperty: 'twitterUser', }), 
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
    // req.logout();
    res.redirect('/');
});

export default router;