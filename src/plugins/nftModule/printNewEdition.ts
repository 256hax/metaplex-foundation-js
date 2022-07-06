import { ConfirmOptions, Keypair, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@/Metaplex';
import {
  findEditionMarkerPda,
  findEditionPda,
  findMetadataPda,
} from '@/programs';
import {
  useOperation,
  Operation,
  OperationHandler,
  Signer,
  token,
  toBigNumber,
} from '@/types';
import {
  DisposableScope,
  InstructionWithSigners,
  TransactionBuilder,
} from '@/utils';
import { Nft } from './Nft';
import { SendAndConfirmTransactionResponse } from '../rpcModule';
import { findAssociatedTokenAccountPda } from '../tokenModule';
import { assertNftOriginalEdition } from './NftEdition';
import {
  createMintNewEditionFromMasterEditionViaTokenInstruction,
  createMintNewEditionFromMasterEditionViaVaultProxyInstruction,
} from '@metaplex-foundation/mpl-token-metadata';

// -----------------
// Operation
// -----------------

const Key = 'PrintNewEditionOperation' as const;
export const printNewEditionOperation =
  useOperation<PrintNewEditionOperation>(Key);
export type PrintNewEditionOperation = Operation<
  typeof Key,
  PrintNewEditionInput,
  PrintNewEditionOutput
>;

export type PrintNewEditionInput = PrintNewEditionSharedInput &
  PrintNewEditionViaInput;

export type PrintNewEditionSharedInput = {
  originalNft: Nft;
  newMint?: Signer; // Defaults to Keypair.generate().
  newMintAuthority?: Signer; // Defaults to mx.identity().
  newUpdateAuthority?: PublicKey; // Defaults to mx.identity().
  newOwner?: PublicKey; // Defaults to mx.identity().
  newTokenAccount?: Signer; // Defaults to creating an associated token account.
  newFreezeAuthority?: PublicKey; // Defaults to mx.identity().
  payer?: Signer; // Defaults to mx.identity().
  tokenProgram?: PublicKey;
  associatedTokenProgram?: PublicKey;
  confirmOptions?: ConfirmOptions;
};

export type PrintNewEditionViaInput =
  | {
      via?: 'token';
      originalTokenAccountOwner?: Signer; // Defaults to mx.identity().
      originalTokenAccount?: PublicKey; // Defaults to associated token address.
    }
  | {
      via: 'vault';
      vaultAuthority: Signer;
      safetyDepositStore: PublicKey;
      safetyDepositBox: PublicKey;
      vault: PublicKey;
      tokenVaultProgram?: PublicKey;
    };

export type PrintNewEditionOutput = {
  response: SendAndConfirmTransactionResponse;
  mintSigner: Signer;
  metadataAddress: PublicKey;
  editionAddress: PublicKey;
  tokenAddress: PublicKey;
};

// -----------------
// Handler
// -----------------

export const printNewEditionOperationHandler: OperationHandler<PrintNewEditionOperation> =
  {
    handle: async (
      operation: PrintNewEditionOperation,
      metaplex: Metaplex,
      scope: DisposableScope
    ) => {
      const builder = await printNewEditionBuilder(metaplex, operation.input);
      scope.throwIfCanceled();
      return builder.sendAndConfirm(metaplex, operation.input.confirmOptions);
    },
  };

// -----------------
// Builder
// -----------------

export type PrintNewEditionBuilderParams = PrintNewEditionViaInput &
  Omit<PrintNewEditionSharedInput, 'confirmOptions'> & {
    createMintAccountInstructionKey?: string;
    initializeMintInstructionKey?: string;
    createAssociatedTokenAccountInstructionKey?: string;
    createTokenAccountInstructionKey?: string;
    initializeTokenInstructionKey?: string;
    mintTokensInstructionKey?: string;
    printNewEditionInstructionKey?: string;
  };

export type PrintNewEditionBuilderContext = Omit<
  PrintNewEditionOutput,
  'response'
>;

export const printNewEditionBuilder = async (
  metaplex: Metaplex,
  params: PrintNewEditionBuilderParams
): Promise<TransactionBuilder<PrintNewEditionBuilderContext>> => {
  const {
    originalNft,
    newMint = Keypair.generate(),
    newMintAuthority = metaplex.identity(),
    newUpdateAuthority = metaplex.identity().publicKey,
    newOwner = metaplex.identity().publicKey,
    newTokenAccount,
    newFreezeAuthority = metaplex.identity().publicKey,
    payer = metaplex.identity(),
    tokenProgram,
    associatedTokenProgram,
    printNewEditionInstructionKey = 'printNewEdition',
  } = params;

  // Original NFT.
  const originalNftEdition = originalNft.edition;
  assertNftOriginalEdition(originalNftEdition);
  const edition = toBigNumber(originalNftEdition.supply.addn(1));
  const originalEditionMarkPda = findEditionMarkerPda(
    originalNft.mintAddress,
    edition
  );

  // New NFT.
  const newMetadataAddress = findMetadataPda(newMint.publicKey);
  const newEditionAddress = findEditionPda(newMint.publicKey);
  const sharedAccounts = {
    newMetadata: newMetadataAddress,
    newEdition: newEditionAddress,
    masterEdition: originalNft.edition.address,
    newMint: newMint.publicKey,
    editionMarkPda: originalEditionMarkPda,
    newMintAuthority: newMintAuthority.publicKey,
    payer: payer.publicKey,
    newMetadataUpdateAuthority: newUpdateAuthority,
    metadata: originalNft.metadataAddress,
  };

  const tokenWithMintBuilder = await metaplex
    .tokens()
    .builders()
    .createTokenWithMint({
      decimals: 0,
      initialSupply: token(1),
      mint: newMint,
      mintAuthority: newMintAuthority,
      freezeAuthority: newFreezeAuthority ?? null,
      owner: newOwner,
      token: newTokenAccount,
      payer,
      tokenProgram,
      associatedTokenProgram,
      createMintAccountInstructionKey: params.createMintAccountInstructionKey,
      initializeMintInstructionKey: params.initializeMintInstructionKey,
      createAssociatedTokenAccountInstructionKey:
        params.createAssociatedTokenAccountInstructionKey,
      createTokenAccountInstructionKey: params.createTokenAccountInstructionKey,
      initializeTokenInstructionKey: params.initializeTokenInstructionKey,
      mintTokensInstructionKey: params.mintTokensInstructionKey,
    });

  const { tokenAddress } = tokenWithMintBuilder.getContext();

  let printNewEditionInstructionWithSigners: InstructionWithSigners;
  if (params.via === 'vault') {
    printNewEditionInstructionWithSigners = {
      instruction:
        createMintNewEditionFromMasterEditionViaVaultProxyInstruction(
          {
            ...sharedAccounts,
            vaultAuthority: params.vaultAuthority.publicKey,
            safetyDepositStore: params.safetyDepositStore,
            safetyDepositBox: params.safetyDepositBox,
            vault: params.vault,
            tokenVaultProgram:
              params.tokenVaultProgram ??
              new PublicKey('vau1zxA2LbssAUEF7Gpw91zMM1LvXrvpzJtmZ58rPsn'),
          },
          { mintNewEditionFromMasterEditionViaTokenArgs: { edition } }
        ),
      signers: [newMint, newMintAuthority, payer, params.vaultAuthority],
      key: printNewEditionInstructionKey,
    };
  } else {
    const originalTokenAccountOwner =
      params.originalTokenAccountOwner ?? metaplex.identity();
    const originalTokenAccount =
      params.originalTokenAccount ??
      findAssociatedTokenAccountPda(
        originalNft.mintAddress,
        originalTokenAccountOwner.publicKey
      );

    printNewEditionInstructionWithSigners = {
      instruction: createMintNewEditionFromMasterEditionViaTokenInstruction(
        {
          ...sharedAccounts,
          tokenAccountOwner: originalTokenAccountOwner.publicKey,
          tokenAccount: originalTokenAccount,
        },
        { mintNewEditionFromMasterEditionViaTokenArgs: { edition } }
      ),
      signers: [newMint, newMintAuthority, payer, originalTokenAccountOwner],
      key: printNewEditionInstructionKey,
    };
  }

  return (
    TransactionBuilder.make<PrintNewEditionBuilderContext>()
      .setFeePayer(payer)
      .setContext({
        mintSigner: newMint,
        metadataAddress: newMetadataAddress,
        editionAddress: newEditionAddress,
        tokenAddress,
      })

      // Create the mint and token accounts before minting 1 token to the owner.
      .add(tokenWithMintBuilder)

      // Mint new edition.
      .add(printNewEditionInstructionWithSigners)
  );
};
