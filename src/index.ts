import Express from "express";
import { clusterApiUrl, PublicKey } from "@solana/web3.js";
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet, AnchorProvider, Program} from "@coral-xyz/anchor";
import bs58 from "bs58";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import idl from "../smart_contract_info/deta.json";
import { Deta } from "./deta";
import cors from "cors";
import BN from "bn.js";
import { PRIVATE_KEY } from "./util"

const idlJson = JSON.parse(JSON.stringify(idl))

const app = Express();

app.use(Express.json());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");


const wallet = new Wallet(
    Keypair.fromSecretKey(new Uint8Array(bs58.decode(PRIVATE_KEY)))
)

const provider = new AnchorProvider(connection, wallet, {})

const program = new Program<Deta>(idlJson, provider,)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"], // Allowed HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
    credentials: true, // Enable cookies if needed
  })
);

app.get("/", (req, res) => {
    res.send("Hello World");
})

//@ts-ignore
app.post("/api/distribute", async (req, res) => {
    const { contributorKey } = req.body;
    const reward = 1

    if (!reward || !contributorKey) {
        return res.status(400).send("insufficient information provided");
    }


    const mint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
    const contributor = new PublicKey(contributorKey)
    const contributorAta = await getTokenAccount(contributorKey, mint.toBase58())
    const detaWallet = await getTokenAccount(wallet.publicKey.toBase58(), mint.toBase58())
    console.log("contributorAta", contributorAta)
    console.log("detaWallet", detaWallet)
    if (!reward || isNaN(reward)) {
        return res.status(400).send("Invalid reward amount");
    }
    
    const rewardBN = new BN(reward * 10 ** 6);      
    try {
        await program.methods.rewardDistribute(rewardBN)
            .accountsStrict({
                admin: wallet.publicKey,
                mint,
                contributor: contributor,
                contributorAta: new PublicKey(contributorAta?.address as string),
                detaWallet: new PublicKey(detaWallet?.address as string),
                associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
                tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
                systemProgram: new PublicKey("11111111111111111111111111111111"),
            })
            .signers([wallet.payer])
            .rpc()

        res.json({success: true});

    } catch (error) {
        console.log(error)
        res.status(500).json({success: false});
    }
})

app.listen(3000, () => {
    console.log("Server is running on port 3000");
})


// Initialize the Solana connection (ensure it's connected to Devnet)

async function getTokenAccount(walletAddress: string, mintAddress: string) {
    const ownerPublicKey = new PublicKey(walletAddress);
    const mintPublicKey = new PublicKey(mintAddress);
  
    // Fetch all token accounts owned by the wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(ownerPublicKey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // SPL Token Program ID
    });

    // Check if a token account already exists for the given mint
    const existingAccount = tokenAccounts.value.find(
        (account) => account.account.data.parsed.info.mint === mintPublicKey.toBase58()
    );

    if (existingAccount) {
        return {
            address: existingAccount.pubkey.toBase58(),
            amount: existingAccount.account.data.parsed.info.tokenAmount.uiAmountString,
        };
    }

    // If no token account exists, compute the expected associated token account (ATA)
    const expectedTokenAccount = await getAssociatedTokenAddress(mintPublicKey, ownerPublicKey);

    return {
        address: expectedTokenAccount.toBase58(), // Return the expected token account address
        amount: "0", // Since the account does not exist yet
    };
}
