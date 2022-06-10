import { assert, expect } from "chai";
import { BigNumber, constants } from "ethers";
import { Contracts, Env, makeSuite } from "./_setup";

makeSuite("InterceptorManager", (contracts: Contracts, env: Env) => {
  it("Revertions work as expected", async () => {
    await expect(
      contracts.interceptorManager.connect(env.admin).addCollectionInterceptor(contracts.redeemNFT.address)
    ).to.be.revertedWith("Interceptor: already whitelisted");

    await expect(
      contracts.interceptorManager.connect(env.admin).addCollectionInterceptor(constants.AddressZero)
    ).to.be.revertedWith("Interceptor: can not be null address");

    await expect(
      contracts.interceptorManager.connect(env.admin).removeCollectionInterceptor(constants.AddressZero)
    ).to.be.revertedWith("Interceptor: not whitelisted");
  });
  it("Owner functions are only callable by owner", async () => {
    const notAdminUser = env.accounts[3];

    await expect(
      contracts.interceptorManager.connect(notAdminUser).addCollectionInterceptor(contracts.transferERC721.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      contracts.interceptorManager.connect(notAdminUser).removeCollectionInterceptor(contracts.transferERC721.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("View functions work as expected", async () => {
    const numberInterceptors = await contracts.interceptorManager.viewCountWhitelistedInterceptors();
    assert.equal(numberInterceptors.toString(), "1");

    let tx = await contracts.interceptorManager.viewWhitelistedInterceptors("0", "1");
    assert.equal(tx[0].length, 1);
    expect(BigNumber.from(tx[1].toString())).to.be.eq(constants.One);

    tx = await contracts.interceptorManager.viewWhitelistedInterceptors("1", "100");
    assert.equal(tx[0].length, 0);
  });
});
