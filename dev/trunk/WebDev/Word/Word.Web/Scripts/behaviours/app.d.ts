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
    Number: number;
    Reference: number;
    RefName: string;
}

interface Book extends WordObjectBase {  
    Chapters: Array<Chapter>;
}
interface Chapter extends WordObjectBase {   
    Verses: Array<Verse>;
}
interface Verse extends WordObjectBase {   
    Words: Array<Word>;
}
interface Word {
}

declare class dhtmlXRibbon{
    constructor(data: RibbonSettings);
    attachEvent(eventName: string, callback: (id: string) => void);
    attachEvent(eventName: string, callback: (id:string,oldId:string)=> void);
} 


