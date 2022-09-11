import { task } from "hardhat/config";
import { getContractFromDB } from "./utils/helpers";
import { verifyEtherscanContract } from "./utils/verification";

task("verify:AuthenticatedProxy", "Verify Contracts").setAction(async (_, { network, run }) => {
  await run("set-DRE");
  await run("compile");

  const authorizationManager = await getContractFromDB("AuthorizationManager");
  const authorizationProxy = await authorizationManager.proxyImplemention();
  console.log("authorizationManager:", authorizationManager.address, "authorizationProxy:", authorizationProxy);

  await verifyEtherscanContract(authorizationProxy, []);
});
