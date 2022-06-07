import { expect } from "chai";
import { defaultAbiCoder, parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Contracts, Env, makeSuite } from "./_setup";
import { constants } from "ethers";

/* eslint-disable no-unused-expressions */
makeSuite("AuthorizationManager", (contracts: Contracts, env: Env) => {
  it("AuthenticatedProxy - Revertions work as expected", async () => {
    const user = env.accounts[1];
    const anotherUser = env.accounts[2];
    const authorizedUser = env.accounts[3];

    const AuthorizationManager = await ethers.getContractFactory("AuthorizationManager");
    const authorizationManager = await AuthorizationManager.deploy(contracts.weth.address, authorizedUser.address);
    await authorizationManager.deployed();

    await authorizationManager.connect(user).registerProxy();
    const userProxyAddress = await authorizationManager.proxies(user.address);
    const userProxyContract = (await ethers.getContractFactory("AuthenticatedProxy")).attach(userProxyAddress);

    const nonTransferERC20 = await (await ethers.getContractFactory("MockNonTransferERC20")).deploy("", "");
    await nonTransferERC20.deployed();

    await expect(
      userProxyContract.connect(user).safeTransfer(nonTransferERC20.address, anotherUser.address, constants.MaxUint256)
    ).to.be.revertedWith("Proxy: transfer failed");

    await expect(userProxyContract.connect(user).withdrawToken(nonTransferERC20.address)).to.be.revertedWith(
      "Proxy: withdraw token failed"
    );

    await expect(
      user.sendTransaction({
        to: userProxyAddress,
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

    await expect(nonPayableProxyContract.connect(authorizedUser).withdrawETH()).to.be.revertedWith(
      "Proxy: withdraw ETH failed"
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
    const user = env.accounts[1];
    const anotherUser = env.accounts[2];

    const proxyAddress = await contracts.authorizationManager.proxies(user.address);
    const proxyContract = (await ethers.getContractFactory("AuthenticatedProxy")).attach(proxyAddress);

    await expect(proxyContract.connect(anotherUser).setRevoke(true)).to.be.revertedWith("Proxy: permission denied");
    await expect(
      proxyContract.connect(anotherUser).safeTransfer(contracts.weth.address, anotherUser.address, constants.MaxUint256)
    ).to.be.revertedWith("Proxy: permission denied");
    await expect(proxyContract.connect(anotherUser).withdrawETH()).to.be.revertedWith("Proxy: permission denied");
    await expect(proxyContract.connect(anotherUser).withdrawToken(contracts.weth.address)).to.be.revertedWith(
      "Proxy: permission denied"
    );
    await expect(
      proxyContract.connect(anotherUser).delegatecall(contracts.transferERC721.address, defaultAbiCoder.encode([], []))
    ).to.be.revertedWith("Proxy: permission denied");

    await expect(proxyContract.connect(user).setRevoke(true)).to.emit(proxyContract, "Revoked").withArgs(true);

    expect(proxyContract.connect(user).withdrawETH()).to.be.ok;
    expect(proxyContract.connect(user).withdrawToken(contracts.weth.address)).to.be.ok;
    expect(
      proxyContract
        .connect(user)
        .delegatecall(
          contracts.transferERC721.address,
          defaultAbiCoder.encode(
            ["address", "address", "address", "uint256", "uint256"],
            [contracts.mockERC721.address, user.address, anotherUser.address, constants.Zero, constants.Zero]
          )
        )
    ).to.be.ok;
  });

  it("AuthenticatedProxy - authorized Address", async () => {
    const user = env.accounts[1];
    const anotherUser = env.accounts[2];
    const authorizedUser = env.accounts[3];

    const AuthorizationManager = await ethers.getContractFactory("AuthorizationManager");
    const authorizationManager = await AuthorizationManager.deploy(contracts.weth.address, authorizedUser.address);
    await authorizationManager.deployed();

    await authorizationManager.connect(user).registerProxy();

    const proxyAddress = await authorizationManager.proxies(user.address);

    const proxyContract = (await ethers.getContractFactory("AuthenticatedProxy")).attach(proxyAddress);

    expect(proxyContract.connect(authorizedUser).withdrawETH()).to.be.ok;
    expect(proxyContract.connect(authorizedUser).withdrawToken(contracts.weth.address)).to.be.ok;
    expect(
      proxyContract
        .connect(authorizedUser)
        .delegatecall(
          contracts.transferERC721.address,
          defaultAbiCoder.encode(
            ["address", "address", "address", "uint256", "uint256"],
            [contracts.mockERC721.address, user.address, anotherUser.address, constants.Zero, constants.Zero]
          )
        )
    ).to.be.ok;

    await proxyContract.connect(user).setRevoke(true);

    await expect(proxyContract.connect(authorizedUser).withdrawETH()).to.be.revertedWith("Proxy: permission denied");
    await expect(proxyContract.connect(authorizedUser).withdrawToken(contracts.weth.address)).to.be.revertedWith(
      "Proxy: permission denied"
    );
    await expect(
      proxyContract
        .connect(authorizedUser)
        .delegatecall(contracts.transferERC721.address, defaultAbiCoder.encode([], []))
    ).to.be.revertedWith("Proxy: permission denied");

    await proxyContract.connect(user).setRevoke(false);
    await authorizationManager.revoke();

    await expect(proxyContract.connect(authorizedUser).withdrawETH()).to.be.revertedWith("Proxy: permission denied");
    await expect(proxyContract.connect(authorizedUser).withdrawToken(contracts.weth.address)).to.be.revertedWith(
      "Proxy: permission denied"
    );
    await expect(
      proxyContract
        .connect(authorizedUser)
        .delegatecall(contracts.transferERC721.address, defaultAbiCoder.encode([], []))
    ).to.be.revertedWith("Proxy: permission denied");
  });
});
