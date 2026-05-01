export namespace main {
	
	export class ExifResult {
	    imageBase64: string;
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
	        this.imageBase64 = source["imageBase64"];
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
	
	    static createFrom(source: any = {}) {
	        return new SaveResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.error = source["error"];
	        this.cancelled = source["cancelled"];
	    }
	}

}

