import { expect } from "chai";
import { defaultAbiCoder, parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Contracts, Env, makeSuite } from "./_setup";
import { constants } from "ethers";

/* eslint-disable no-unused-expressions */
makeSuite("AuthorizationManager", (contracts: Contracts, env: Env) => {
  it("AuthenticatedProxy - Revertions work as expected", async () => {
    const proxyOwner = env.accounts[1];
    const authorizedAddress = env.accounts[3];

    const AuthorizationManager = await ethers.getContractFactory("AuthorizationManager");
    const authorizationManager = await AuthorizationManager.deploy(contracts.weth.address, authorizedAddress.address);
    await authorizationManager.deployed();

    await authorizationManager.connect(proxyOwner).registerProxy();
    const proxyAddress = await authorizationManager.proxies(proxyOwner.address);
    const userProxyContract = (await ethers.getContractFactory("AuthenticatedProxy")).attach(proxyAddress);

    const nonTransferERC20 = await (await ethers.getContractFactory("MockNonTransferERC20")).deploy("", "");
    await nonTransferERC20.deployed();

    await expect(
      userProxyContract
        .connect(authorizedAddress)
        .safeTransfer(nonTransferERC20.address, authorizedAddress.address, constants.MaxUint256)
    ).to.be.revertedWith("SafeERC20: ERC20 operation did not succeed");

    await expect(userProxyContract.connect(proxyOwner).withdrawToken(nonTransferERC20.address)).to.be.revertedWith(
      "SafeERC20: ERC20 operation did not succeed"
    );

    await expect(
      proxyOwner.sendTransaction({
        to: proxyAddress,
        value: parseEther("1.0"),
      })
    ).to.be.revertedWith("Receive not allowed");

    const nonPayable = await (await ethers.getContractFactory("MockNonPayable")).deploy();
    await nonPayable.deployed();
    await nonPayable.registerProxy(authorizationManager.address);

    const nonPayableProxyAddress = await authorizationManager.proxies(nonPayable.address);
    const nonPayableProxyContract = (await ethers.getContractFactory("AuthenticatedProxy")).attach(
      nonPayableProxyAddress
    );

    await expect(nonPayableProxyContract.connect(authorizedAddress).withdrawETH()).to.be.revertedWith(
      "Address: unable to send value, recipient may have reverted"
    );
  });
  it("AuthorizationManager - Revertions work as expected", async () => {
    await expect(contracts.authorizationManager.connect(env.accounts[1]).registerProxy()).to.be.revertedWith(
      "Authorization: user already has a proxy"
    );
  });

  it("AuthorizationManager - Owner revertions work as expected", async () => {
    const notAdminUser = env.accounts[3];

    await expect(contracts.authorizationManager.connect(notAdminUser).revoke()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
  it("AuthorizationManager - Owner functions are only callable by owner", async () => {
    await expect(contracts.authorizationManager.connect(env.admin).revoke()).to.emit(
      contracts.authorizationManager,
      "Revoked"
    );
  });

  it("AuthenticatedProxy - access control", async () => {
    const proxyOwner = env.accounts[1];
    const anotherUser = env.accounts[2];

    const proxyAddress = await contracts.authorizationManager.proxies(proxyOwner.address);
    const proxyContract = (await ethers.getContractFactory("AuthenticatedProxy")).attach(proxyAddress);

    await expect(proxyContract.connect(anotherUser).setRevoke(true)).to.be.revertedWith("Proxy: permission denied");

    await expect(
      proxyContract.connect(proxyOwner).safeTransfer(contracts.weth.address, anotherUser.address, constants.MaxUint256)
    ).to.be.revertedWith("Proxy: permission denied");

    await expect(
      proxyContract.connect(anotherUser).safeTransfer(contracts.weth.address, anotherUser.address, constants.MaxUint256)
    ).to.be.revertedWith("Proxy: permission denied");

    await expect(proxyContract.connect(anotherUser).withdrawETH()).to.be.revertedWith("Proxy: permission denied");
    await expect(proxyContract.connect(anotherUser).withdrawToken(contracts.weth.address)).to.be.revertedWith(
      "Proxy: permission denied"
    );

    await expect(
      proxyContract.connect(proxyOwner).delegatecall(contracts.transferERC721.address, defaultAbiCoder.encode([], []))
    ).to.be.revertedWith("Proxy: permission denied");

    await expect(
      proxyContract.connect(anotherUser).delegatecall(contracts.transferERC721.address, defaultAbiCoder.encode([], []))
    ).to.be.revertedWith("Proxy: permission denied");

    await expect(proxyContract.connect(proxyOwner).setRevoke(true)).to.emit(proxyContract, "Revoked").withArgs(true);

    expect(proxyContract.connect(proxyOwner).withdrawETH()).to.be.ok;
    expect(proxyContract.connect(proxyOwner).withdrawToken(contracts.weth.address)).to.be.ok;
  });

  it("AuthenticatedProxy - authorized Address", async () => {
    const proxyOwner = env.accounts[1];
    const anotherUser = env.accounts[2];
    const authorizedAddress = env.accounts[3];

    const AuthorizationManager = await ethers.getContractFactory("AuthorizationManager");
    const authorizationManager = await AuthorizationManager.deploy(contracts.weth.address, authorizedAddress.address);
    await authorizationManager.deployed();

    await authorizationManager.connect(proxyOwner).registerProxy();

    const proxyAddress = await authorizationManager.proxies(proxyOwner.address);

    const proxyContract = (await ethers.getContractFactory("AuthenticatedProxy")).attach(proxyAddress);

    expect(proxyContract.connect(authorizedAddress).withdrawETH()).to.be.ok;
    expect(proxyContract.connect(authorizedAddress).withdrawToken(contracts.weth.address)).to.be.ok;
    expect(
      proxyContract
        .connect(authorizedAddress)
        .delegatecall(
          contracts.transferERC721.address,
          defaultAbiCoder.encode(
            ["address", "address", "address", "uint256", "uint256"],
            [contracts.mockERC721.address, proxyOwner.address, anotherUser.address, constants.Zero, constants.Zero]
          )
        )
    ).to.be.ok;

    await proxyContract.connect(proxyOwner).setRevoke(true);

    await expect(proxyContract.connect(authorizedAddress).withdrawETH()).to.be.revertedWith("Proxy: permission denied");
    await expect(proxyContract.connect(authorizedAddress).withdrawToken(contracts.weth.address)).to.be.revertedWith(
      "Proxy: permission denied"
    );
    await expect(
      proxyContract
        .connect(authorizedAddress)
        .delegatecall(contracts.transferERC721.address, defaultAbiCoder.encode([], []))
    ).to.be.revertedWith("Proxy: permission denied");

    await proxyContract.connect(proxyOwner).setRevoke(false);
    await authorizationManager.revoke();

    await expect(proxyContract.connect(authorizedAddress).withdrawETH()).to.be.revertedWith("Proxy: permission denied");
    await expect(proxyContract.connect(authorizedAddress).withdrawToken(contracts.weth.address)).to.be.revertedWith(
      "Proxy: permission denied"
    );
    await expect(
      proxyContract
        .connect(authorizedAddress)
        .delegatecall(contracts.transferERC721.address, defaultAbiCoder.encode([], []))
    ).to.be.revertedWith("Proxy: permission denied");
  });
});
