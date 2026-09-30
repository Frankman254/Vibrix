import { lazy, Suspense, type ComponentType } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppAssetBootstrap from '@/components/app/AppAssetBootstrap';
import RouteRuntimeModeSync from '@/components/app/RouteRuntimeModeSync';
import MediaTrackKeyListener from '@/components/app/MediaTrackKeyListener';
import WallpaperAppProviders from '@/components/app/WallpaperAppProviders';
import EditorPage from '@/pages/EditorPage';
import OutputShellPage from '@/pages/OutputShellPage';
import PreviewPage from '@/pages/PreviewPage';

const SpectrumFxLabPage = import.meta.env.DEV
	? () =>
			import('@/dev/spectrumFxLab/SpectrumFxLabPage').then(m => ({
				default: m.default
			}))
	: null;

function DevLazyRoute({
	loader
}: {
	loader: (() => Promise<{ default: ComponentType }>) | null;
}) {
	if (!loader) return <Navigate replace to="/edit" />;
	const Lazy = lazy(loader);
	return (
		<Suspense fallback={null}>
			<Lazy />
		</Suspense>
	);
}

export default function App() {
	return (
		<HashRouter>
			<WallpaperAppProviders>
				<RouteRuntimeModeSync />
				<MediaTrackKeyListener />
				<AppAssetBootstrap />
				<Routes>
					<Route path="/" element={<Navigate replace to="/edit" />} />
					<Route path="/edit" element={<EditorPage />} />
					<Route
						path="/editor"
						element={<Navigate replace to="/edit" />}
					/>
					<Route path="/present" element={<OutputShellPage />} />
					<Route path="/record" element={<OutputShellPage />} />
					<Route path="/preview" element={<PreviewPage />} />
					{import.meta.env.DEV ? (
						<>
							<Route
								path="/dev/spectrum-fx"
								element={
									<DevLazyRoute loader={SpectrumFxLabPage} />
								}
							/>
						</>
					) : null}
				</Routes>
			</WallpaperAppProviders>
		</HashRouter>
	);
}
