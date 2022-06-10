import { assert, expect } from "chai";
import { BigNumber, constants } from "ethers";
import { Contracts, Env, makeSuite } from "./_setup";

makeSuite("ExecutionManager", (contracts: Contracts, env: Env) => {
  it("Revertions work as expected", async () => {
    await expect(
      contracts.executionManager.connect(env.admin).addStrategy(contracts.strategyPrivateSale.address)
    ).to.be.revertedWith("Strategy: already whitelisted");

    // MockUSDT is obviously not a strategy but this checks only if the address is in enumerable set
    await expect(
      contracts.executionManager.connect(env.admin).removeStrategy(contracts.mockUSDT.address)
    ).to.be.revertedWith("Strategy: not whitelisted");
  });

  it("Owner functions are only callable by owner", async () => {
    const notAdminUser = env.accounts[3];

    await expect(
      contracts.executionManager.connect(notAdminUser).addStrategy(contracts.strategyPrivateSale.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      contracts.executionManager.connect(notAdminUser).removeStrategy(contracts.strategyPrivateSale.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("View functions work as expected", async () => {
    const numberStrategies = await contracts.executionManager.viewCountWhitelistedStrategies();
    assert.equal(numberStrategies.toString(), "5");

    let tx = await contracts.executionManager.viewWhitelistedStrategies("0", "2");
    assert.equal(tx[0].length, 2);
    expect(BigNumber.from(tx[1].toString())).to.be.eq(constants.Two);

    tx = await contracts.executionManager.viewWhitelistedStrategies("2", "100");
    assert.equal(tx[0].length, 3);
    expect(BigNumber.from(tx[1].toString())).to.be.eq(BigNumber.from(numberStrategies.toString()));
  });
});
