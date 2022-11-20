import crypto from 'crypto';

/*

-- OAUTH FLOW --

 - Before going to matrica link, have user sign nonce with their wallet
    - Generate nonce on server
    - Sign nonce with wallet
    - Send signed nonce to server
    - Server verifies signed nonce
    - Send back jwt with publicKey if verified, else send back error

 - User clicks on matrica link
    - https://matrica.io/oauth2
        - ?client_id=
        - &redirect_uri=
        - &response_type=code
        - &scope={jwt token w/ pubkey OR random long string?}
        - &code_challenge=
        - &code_challenge_method=S256

*/


// generate code_verifier


const CLIENT_ID = "7d116414fa8fee5";
const REDIRECT_URI = "http://localhost:3001/api/oauth/callback";
const RESPONSE_TYPE = "code";
const SCOPE = "profile nfts socials.discord socials.twitter";
const CODE_CHALLENGE_METHOD = "S256";

const generateLoginUrl = () => {
    const codeVerifier = crypto.randomBytes(32).toString('hex');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('hex');

    return `https://matrica.io/oauth2?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=${RESPONSE_TYPE}&scope=${SCOPE}&code_challenge=${codeChallenge}&code_challenge_method=${CODE_CHALLENGE_METHOD}`;
}

console.log(generateLoginUrl())