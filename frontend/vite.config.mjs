import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		react(),
	],
	resolve: {
		alias: {
			App: path.resolve(__dirname, "src/App.jsx"),
			"@": path.resolve(__dirname, "src"),
			assets: path.resolve(__dirname, "src/assets"),
			cdnAssets: path.resolve(__dirname, "src/cdnAssets"),
			components: path.resolve(__dirname, "src/components"),
			pages: path.resolve(__dirname, "src/pages"),
			contexts: path.resolve(__dirname, "src/contexts"),
			hooks: path.resolve(__dirname, "src/hooks"),
			utilities: path.resolve(__dirname, "src/utilities"),
			modules: path.resolve(__dirname, "src/modules"),
			hoc: path.resolve(__dirname, "src/hoc"),
			context: path.resolve(__dirname, "src/context"),
			data: path.resolve(__dirname, "src/data"),
			lib: path.resolve(__dirname, "src/lib"),
			features: path.resolve(__dirname, "src/features"),
		},
	},
	//   esbuild: {
	//     loader: "jsx",
	//     // Apply to all .js files
	//     include: /\.js$/,
	//     exclude: [],
	//   },
	//   optimizeDeps: {
	//     esbuildOptions: {
	//       loader: {
	//         ".js": "jsx", // 👈 force JSX in .js files
	//       },
	//     },
	//   },
	build: {
		chunkSizeWarningLimit: 600,
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: "./src/test/setup.js",
	},
	server: {
		port: 3000,
	},
	// Bundle PDF.js as a version-matched JavaScript worker, rather than copying
	// an opaque .mjs asset that some production hosts serve as octet-stream.
	worker: { format: "es" },
});
