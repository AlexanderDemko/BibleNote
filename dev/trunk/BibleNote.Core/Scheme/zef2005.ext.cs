using System.Linq;
using System.Collections.Generic;
using System;
using System.Xml.Serialization;
using BibleNote.Core.Common;
using BibleNote.Core.Constants;

namespace BibleCommon.Scheme
{
    public partial class XMLBIBLE
    {
        public string ModuleShortName { get; set; }        

        [XmlIgnore]
        public List<BIBLEBOOK> Books
        {
            get
            {
                if (this.BIBLEBOOK != null)
                    return this.BIBLEBOOK.ToList();

                return new List<BIBLEBOOK>();
            }
        }

        
        private Dictionary<int, BIBLEBOOK> _booksDictionary;
        [XmlIgnore]
        public Dictionary<int, BIBLEBOOK> BooksDictionary
        {
            get
            {
                if (_booksDictionary == null)
                {
                    _booksDictionary = new Dictionary<int, BIBLEBOOK>();
                    foreach (var book in BIBLEBOOK)
                        _booksDictionary.Add(book.Index, book);
                }

                return _booksDictionary;
            }
        }
        
        public bool VerseExists(ModuleVersePointer vp, out VerseNumber verseNumber)
        {
            verseNumber = vp.VerseNumber;
            try
            {
                bool isEmpty;
                bool isFullVerse;
                bool isPartOfBigVerse;
                bool hasValueEvenIfEmpty;
                this.BooksDictionary[vp.BookIndex].GetVerseContent(vp, ModuleShortName, string.Empty, true, out verseNumber, out isEmpty, out isFullVerse, out isPartOfBigVerse, out hasValueEvenIfEmpty);
                return true;
            }
            catch (VerseNotFoundException)
            {
                return false;
            }
            catch (ChapterNotFoundException)
            {
                return false;
            }
        }

        public bool BookHasOnlyOneChapter(SimpleVersePointer vp)
        {
            return this.BooksDictionary[vp.BookIndex].Chapters.Count == 1;
        }
    }

    public partial class BIBLEBOOK
    {
        [XmlIgnore]
        public int Index
        {
            get
            {
                return !string.IsNullOrEmpty(this.bnumber) ? int.Parse(this.bnumber) : default(int);
            }
        }

        [XmlIgnore]
        public List<CHAPTER> Chapters
        {
            get
            {
                if (this.Items != null)
                    return this.Items.ToList();

                return new List<CHAPTER>();
            }
        }        

        /// <summary>
        /// 
        /// </summary>
        /// <param name="versePointer"></param>
        /// <param name="moduleShortName"></param>
        /// <param name="strongPrefix"></param>
        /// <param name="getVerseNumberForEmptyVerses"></param>
        /// <param name="verseNumber"></param>
        /// <param name="isEmpty"></param>
        /// <param name="isFullVerse"></param>
        /// <param name="isPartOfBigVerse"></param>
        /// <param name="hasValueEvenIfEmpty">У нас есть стих в ibs (Лев 12:7). Ему по смыслу соответствуют два стиха из rst (Лев 12:7-8). Но поделить стих в ibs не поулчается, потому палочка стоит в конце стиха. Но это не значит, что воьсмой стих пустой!</param>
        /// <returns></returns>
        public string GetVerseContent(ModuleVersePointer versePointer, string moduleShortName, string strongPrefix, bool getVerseNumberForEmptyVerses, 
            out VerseNumber verseNumber, out bool isEmpty, out bool isFullVerse, out bool isPartOfBigVerse, out bool hasValueEvenIfEmpty)
        {
            isFullVerse = true;
            isEmpty = false;
            isPartOfBigVerse = false;
            hasValueEvenIfEmpty = false;

            verseNumber = versePointer.VerseNumber;

            if (versePointer.IsEmpty)
            {
                isEmpty = true;                
                return null;
            }

            if (this.Chapters.Count < versePointer.Chapter)
                throw new ChapterNotFoundException(versePointer, moduleShortName, BaseVersePointerException.Severity.Warning);

            var chapter = this.Chapters[versePointer.Chapter - 1];

            if (versePointer.VerseNumber.IsChapter)            
                return string.Empty;            

            var verse = chapter.GetVerse(versePointer, moduleShortName, getVerseNumberForEmptyVerses, out verseNumber, out isPartOfBigVerse);
            if (verse == null)
                throw new VerseNotFoundException(versePointer, moduleShortName, BaseVersePointerException.Severity.Warning);            

            if (verse.IsEmpty)
            {
                isEmpty = true;
                return string.Empty;
            }

            string result = null;

            var verseContent = verse.GetValue(true, strongPrefix);
            var shelledVerseContent = ShellVerseText(verseContent);

            if (versePointer.PartIndex.HasValue)
            {
                var versesParts = verseContent.Split(new char[] { '|' });
                if (versesParts.Length > versePointer.PartIndex.Value)
                    result = versesParts[versePointer.PartIndex.Value].Trim();

                if (result == SystemConstants.NotEmptyVerseContentSymbol)
                    hasValueEvenIfEmpty = true;

                result = ShellVerseText(result);
                if (result != shelledVerseContent)
                    isFullVerse = false;
            }
            else
            {
                if (verseContent == SystemConstants.NotEmptyVerseContentSymbol)   // пока эту строчку не тестировал. Не понятно, можно ли такое использовать и зачем.
                    hasValueEvenIfEmpty = true;

                result = shelledVerseContent;
            }

            return result;
        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="verses"></param>
        /// <param name="strongPrefix"></param>
        /// <param name="topVerse"></param>
        /// <param name="isEmpty"></param>
        /// <param name="isFullVerses">Запрашиваемые стихи являются полными. А то стих может быть "Текст стиха|". То есть вроде как две части стиха, но первая часть равна всему стиху.</param>
        /// <param name="isDiscontinuous">Прерывистые стихи. Например: 8,22. </param>
        /// <param name="isPartOfBigVerse">Часть "бОльшего стиха". Например, если стих :3 а в ibs :2-4 - это один стих.</param>
        /// <param name="notFoundVerses"></param>
        /// <returns></returns>
        public string GetVersesContent(List<ModuleVersePointer> verses, string moduleShortName, string strongPrefix, 
            out int? topVerse, out bool isEmpty, out bool isFullVerses, out bool isDiscontinuous, out bool isPartOfBigVerse, out bool hasValueEvenIfEmpty,
            out List<SimpleVersePointer> notFoundVerses, out List<SimpleVersePointer> emptyVerses)
        {
            var contents = new List<string>();
            notFoundVerses = new List<SimpleVersePointer>();
            emptyVerses = new List<SimpleVersePointer>();

            var firstVerse = verses.First();
            topVerse = firstVerse.VerseNumber.TopVerse.GetValueOrDefault(firstVerse.VerseNumber.Verse);

            isEmpty = true;
            isFullVerses = true;
            isDiscontinuous = false;
            isPartOfBigVerse = false;
            hasValueEvenIfEmpty = false;

            foreach (var verse in verses)
            {
                bool localIsEmpty, localIsFullVerse;
                VerseNumber vn;
                var verseContent = GetVerseContent(verse, moduleShortName, strongPrefix, false, out vn, out localIsEmpty, out localIsFullVerse, out isPartOfBigVerse, out hasValueEvenIfEmpty);
                contents.Add(verseContent);

                if (!localIsEmpty)
                {
                    if (verseContent == null)
                        notFoundVerses.Add(verse);
                    else if (verseContent == string.Empty)
                        localIsEmpty = true;
                }

                if (localIsEmpty)                
                    emptyVerses.Add(verse);                                    

                isEmpty = isEmpty && localIsEmpty;
                isFullVerses = isFullVerses && localIsFullVerse;

                if (vn.Verse > topVerse + 1)
                    isDiscontinuous = true;

                if (vn.TopVerse.GetValueOrDefault(vn.Verse) > topVerse)
                    topVerse = vn.TopVerse.GetValueOrDefault(vn.Verse);                                
            }

            if (topVerse == firstVerse.VerseNumber.Verse)
                topVerse = null;

            if (contents.All(c => c == null))
                return null;
            else
                return string.Join(" ", contents.ToArray());
        }

        public static string GetFullVerseString(int verseNumber, int? topVerseNumber, string verseText)
        {
            string verseNumberString = topVerseNumber.HasValue ? string.Format("{0}-{1}", verseNumber, topVerseNumber) : verseNumber.ToString();
            return string.Format("<span style='vertical-align:super'>{0}</span><span> </span>{1}", verseNumberString, ShellVerseText(verseText));
        }

        private static string ShellVerseText(string verseText)
        {
            if (!string.IsNullOrEmpty(verseText))
            {
                verseText = verseText
                    .Replace("|", string.Empty)
                    .Replace(SystemConstants.NotEmptyVerseContentSymbol, string.Empty);
            }

            return verseText;
        }
    }

    public partial class CHAPTER
    {
        [XmlIgnore]
        public int Index
        {
            get
            {
                return !string.IsNullOrEmpty(this.cnumber) ? int.Parse(this.cnumber) : default(int);
            }
        }

        [XmlIgnore]
        public List<VERS> Verses
        {
            get
            {
                if (this.Items != null)
                    return this.Items.OfType<VERS>().ToList();

                return new List<VERS>();
            }
        }       

        private Dictionary<int, VERS> _versesDictionary;
        public VERS GetVerse(SimpleVersePointer versePointer, string moduleShortName, bool getVerseNumberForEmptyVerses, out VerseNumber verseNumber, out bool isPartOfBigVerse)
        {
            VERS result = null;
            isPartOfBigVerse = false;
            verseNumber = versePointer.VerseNumber;

            if (_versesDictionary == null)
                LoadVersesDictionary(versePointer, moduleShortName);            

            if (_versesDictionary.ContainsKey(versePointer.VerseNumber.Verse))
            {
                result = _versesDictionary[versePointer.VerseNumber.Verse];
                verseNumber = result.VerseNumber;
                isPartOfBigVerse = verseNumber.IsMultiVerse;
            }
            else
            {
                result = Verses.FirstOrDefault(v => v.IsMultiVerse && 
                    (v.Index <= versePointer.VerseNumber.Verse && versePointer.VerseNumber.Verse <= v.TopIndex));
                if (result != null)
                {
                    if (getVerseNumberForEmptyVerses)
                        verseNumber = result.VerseNumber;
                    isPartOfBigVerse = true;
                    result = VERS.Empty;  // так как стих является частью бОльшего стиха
                }
            }

            return result;
        }

        private void LoadVersesDictionary(SimpleVersePointer verse, string moduleShortName)
        {
            _versesDictionary = new Dictionary<int, VERS>();
            foreach (var v in Verses)
            {
                if (_versesDictionary.ContainsKey(v.Index))
                    throw new BaseVersePointerException(
                                    string.Format("Repeated verses were found in chapter '({2}) {0} {1}'", verse.BookIndex, this.Index, moduleShortName),
                                    BaseVersePointerException.Severity.Error);
                _versesDictionary.Add(v.Index, v);               
            }
        }
    }

    public partial class VERS
    {
        [XmlIgnore]
        public int Index
        {
            get
            {
                return !string.IsNullOrEmpty(this.vnumber) ? int.Parse(this.vnumber) : default(int);                
            }
        }

        [XmlIgnore]
        public int? TopIndex
        {
            get
            {
                return !string.IsNullOrEmpty(this.e) ? (int?)int.Parse(this.e) : null;
            }
        }

        [XmlIgnore]
        public bool IsMultiVerse 
        {
            get 
            {
                return TopIndex.HasValue; 
            }
        }

        [XmlIgnore]
        public VerseNumber VerseNumber
        {
            get
            {
                return new VerseNumber(Index, TopIndex);
            }
        }

        [XmlIgnore]
        public static VERS Empty
        {
            get
            {                
                return new VERS();
            }
        }

        [XmlIgnore]
        public bool IsEmpty
        {
            get
            {
                return string.IsNullOrEmpty(this.vnumber);
            }
        }

        public string GetValue(bool includeStrongNumbers, string strongPrefix = null)
        {
            return GetVerseText(this.Items, includeStrongNumbers, strongPrefix);
        }

        [XmlIgnore]
        public string Value
        {
            get
            {
                return GetValue(false);
            }
        }

        public static string GetVerseText(object[] items, bool includeStrongNumbers = false, string strongPrefix = null)
        {
            if (items == null)
                return null;
 
            return string.Concat(items.Where(
                                    item =>
                                        item is GRAM
                                     || item is STYLE
                                     || item is SUP
                                     || item is string)
                                 .Select(
                                    item =>
                                    {
                                        if (item is GRAM && includeStrongNumbers)                                        
                                            return string.Format("{0} {1}", item.ToString(), ((GRAM)item).GetStrongNumbersString(strongPrefix));                                        
                                        else
                                            return item;
                                    }).ToArray())
                    .Trim()
                    .Replace("  ", " ");
        }
    }

    public partial class gr : GRAM
    {
    }

    public partial class GRAM
    {
        public override string ToString()
        {
            if (Items != null)
                return string.Concat(Items);

            return string.Empty;
        }

        public string GetStrongNumbersString(string strongPrefix)
        {
            if (string.IsNullOrEmpty(strongPrefix))
                return str;

            var strongNumbers = str.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            return string.Join(" ", strongNumbers.Select(sn => 
                string.Concat(strongPrefix, 
                                int.Parse(sn).ToString("0000"))
                ).ToArray());
        }
    }

    public partial class STYLE
    {
        public override string ToString()
        {
            if (Items != null)
                return string.Concat(Items);            

            return string.Empty;
        }
    }

    public partial class SUP
    {
        public override string ToString()
        {
            if (Items != null)
                return string.Concat(Items);            

            return string.Empty;
        }
    } 
}
