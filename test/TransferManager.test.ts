import { expect } from "chai";
import { constants } from "ethers";
import { Contracts, Env, makeSuite } from "./_setup";

makeSuite("TransferManager", (contracts: Contracts, env: Env) => {
  it("Owner revertions work as expected", async () => {
    await expect(
      contracts.transferManager
        .connect(env.admin)
        .addCollectionTransfer(contracts.mockERC721.address, constants.AddressZero)
    ).to.be.revertedWith("Owner: transfer cannot be null address");

    await expect(
      contracts.transferManager
        .connect(env.admin)
        .addCollectionTransfer(constants.AddressZero, contracts.transferERC721.address)
    ).to.be.revertedWith("Owner: collection cannot be null address");

    await expect(
      contracts.transferManager.connect(env.admin).removeCollectionTransfer(contracts.mockERC721.address)
    ).to.be.revertedWith("Owner: collection has no transfer");
  });

  it("Owner functions are only callable by owner", async () => {
    const notAdminUser = env.accounts[3];

    await expect(
      contracts.transferManager
        .connect(notAdminUser)
        .addCollectionTransfer(contracts.mockERC721WithRoyalty.address, contracts.transferERC721.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      contracts.transferManager.connect(notAdminUser).removeCollectionTransfer(contracts.mockERC721WithRoyalty.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
