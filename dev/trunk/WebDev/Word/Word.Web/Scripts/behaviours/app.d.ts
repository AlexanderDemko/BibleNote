interface RibbonItemGroup {
    type: string;
    text: string;
    mode: string;
    list: Array<RibbonItem>;
}
interface RibbonTab {
    id: string;
    type: string;
    text: string;
    active: boolean;
    items: Array<RibbonItemGroup>;
}
interface RibbonItem {
    id: string;
    type: string;
    text: string;
    isbig: boolean;
    img: string;
}

interface RibbonSettings{
    parent: string;
    icons_path: string;
    items: Array<RibbonItemGroup>;
}

interface WordObjectBase {
    number: number;
    reference: number;
    refName: string;
}

interface Book extends WordObjectBase {  
    chapters: Array<Chapter>;
}
interface Chapter extends WordObjectBase {   
    verses: Array<Verse>;
}
interface Verse extends WordObjectBase {   
    words: Array<Word>;
}
interface Word extends WordObjectBase{
    text: string;
    isText: boolean;
}

declare class dhtmlXRibbon{
    constructor(data: RibbonSettings);
    attachEvent(eventName: string, callback: (id: string) => void);
    attachEvent(eventName: string, callback: (id:string,oldId:string)=> void);
} 


