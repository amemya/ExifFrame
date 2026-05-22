export namespace main {
	
	export class ExifResult {
	    imageURL: string;
	    mimeType: string;
	    camera: string;
	    lens: string;
	    focalLength: string;
	    aperture: string;
	    shutterSpeed: string;
	    iso: string;
	    error: string;
	    cancelled: boolean;
	    filePath: string;
	
	    static createFrom(source: any = {}) {
	        return new ExifResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.imageURL = source["imageURL"];
	        this.mimeType = source["mimeType"];
	        this.camera = source["camera"];
	        this.lens = source["lens"];
	        this.focalLength = source["focalLength"];
	        this.aperture = source["aperture"];
	        this.shutterSpeed = source["shutterSpeed"];
	        this.iso = source["iso"];
	        this.error = source["error"];
	        this.cancelled = source["cancelled"];
	        this.filePath = source["filePath"];
	    }
	}
	export class SaveResult {
	    error: string;
	    cancelled: boolean;
	    saveToken: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.error = source["error"];
	        this.cancelled = source["cancelled"];
	        this.saveToken = source["saveToken"];
	    }
	}
	export class Settings {
	    watchFolder: string;
	    exportFolder: string;
	    aspectRatioPreset: string;
	    customRatioW: number;
	    customRatioH: number;
	    orientation: string;
	    alignment: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.watchFolder = source["watchFolder"];
	        this.exportFolder = source["exportFolder"];
	        this.aspectRatioPreset = source["aspectRatioPreset"];
	        this.customRatioW = source["customRatioW"];
	        this.customRatioH = source["customRatioH"];
	        this.orientation = source["orientation"];
	        this.alignment = source["alignment"];
	    }
	}

}

