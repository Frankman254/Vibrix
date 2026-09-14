/**
 * Flash Edge Drive — valor compartido entre FlashLightCanvas y los
 * renderers de borde por capa.
 *
 * FlashLightCanvas actualiza este valor cada frame (siempre, aunque el
 * Flash Light visual esté desactivado). Los renderers de capa lo leen para
 * sincronizarse exactamente con la misma envolvente del Flash Light.
 *
 * El estado vive en un `FlashEdgeScope`. El viewport en vivo usa el scope por
 * defecto (LIVE); el export offline crea el suyo y se lo pasa al stageFx
 * subsystem (escritor) y a los readers, así exportar no muta el drive del
 * canvas en vivo ni viceversa.
 */

export type FlashEdgeScope = {
	drive: number;
	color: string;
};

export function createFlashEdgeScope(): FlashEdgeScope {
	return { drive: 0, color: '#ffffff' };
}

/** El scope que usan los componentes en vivo cuando no se les pasa uno. */
export const LIVE_FLASH_EDGE_SCOPE: FlashEdgeScope = createFlashEdgeScope();

/** Llamado desde FlashLightCanvas en cada frame. */
export function updateFlashEdgeDrive(
	drive: number,
	color: string,
	scope: FlashEdgeScope = LIVE_FLASH_EDGE_SCOPE
): void {
	scope.drive = drive;
	scope.color = color;
}

/** Drive actual del Flash Light (0–~0.92). */
export function getFlashEdgeDrive(
	scope: FlashEdgeScope = LIVE_FLASH_EDGE_SCOPE
): number {
	return scope.drive;
}

/** Color resuelto del Flash Light (hex). */
export function getFlashEdgeColor(
	scope: FlashEdgeScope = LIVE_FLASH_EDGE_SCOPE
): string {
	return scope.color;
}
