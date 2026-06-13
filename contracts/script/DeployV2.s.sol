// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/StackBallGameV2.sol";
import "../lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployV2 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying StackBallGameV2...");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        StackBallGameV2 implementation = new StackBallGameV2();
        console.log("Implementation deployed at:", address(implementation));

        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeWithSelector(StackBallGameV2.initialize.selector, deployer)
        );
        console.log("Proxy deployed at:", address(proxy));

        vm.stopBroadcast();

        console.log("\n=== NEXT STEPS ===");
        console.log("1. Update .env.local: NEXT_PUBLIC_CONTRACT_ADDRESS=", address(proxy));
        console.log("2. Update backend/.env: CONTRACT_ADDRESS=", address(proxy));
        console.log("3. Deposit prize pool:");
        console.log(
            "   cast send",
            address(proxy),
            '"depositPrize()" --value 114ether --private-key $PRIVATE_KEY --rpc-url $CELO_RPC_URL'
        );
        console.log("4. Verify implementation:");
        console.log(
            "   forge verify-contract",
            address(implementation),
            "src/StackBallGameV2.sol:StackBallGameV2 --chain celo_mainnet"
        );
        console.log("5. Start backend: cd backend && pnpm start");

        _saveDeployment(address(proxy), address(implementation));
    }

    function _saveDeployment(address proxy, address implementation) internal {
        string memory obj = "deploymentV2";
        vm.serializeAddress(obj, "proxy", proxy);
        vm.serializeAddress(obj, "implementation", implementation);
        vm.serializeUint(obj, "chainId", block.chainid);
        string memory json = vm.serializeUint(obj, "deployedAt", block.timestamp);
        vm.writeFile("abi/deploymentV2.json", json);
    }
}
