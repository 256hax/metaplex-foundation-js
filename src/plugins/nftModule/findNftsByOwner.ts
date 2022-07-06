import { PublicKey } from '@solana/web3.js';
import { Metaplex } from '@/Metaplex';
import { TokenProgram } from '../tokenModule';
import { Operation, OperationHandler, useOperation } from '@/types';
import { findNftsByMintListOperation } from './findNftsByMintList';
import { Nft } from './Nft';
import { DisposableScope } from '@/utils';

// -----------------
// Operation
// -----------------

const Key = 'FindNftsByOwnerOperation' as const;
export const findNftsByOwnerOperation =
  useOperation<FindNftsByOwnerOperation>(Key);
export type FindNftsByOwnerOperation = Operation<typeof Key, PublicKey, Nft[]>;

// -----------------
// Handler
// -----------------

export const findNftsByOwnerOnChainOperationHandler: OperationHandler<FindNftsByOwnerOperation> =
  {
    handle: async (
      operation: FindNftsByOwnerOperation,
      metaplex: Metaplex,
      scope: DisposableScope
    ): Promise<Nft[]> => {
      const owner = operation.input;

      const mints = await TokenProgram.tokenAccounts(metaplex)
        .selectMint()
        .whereOwner(owner)
        .whereAmount(1)
        .getDataAsPublicKeys();
      scope.throwIfCanceled();

      const nfts = await metaplex
        .operations()
        .execute(findNftsByMintListOperation(mints));

      return nfts.filter((nft): nft is Nft => nft !== null);
    },
  };
