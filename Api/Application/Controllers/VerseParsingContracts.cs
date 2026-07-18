using System.Collections.Generic;

namespace BibleNote.Application.Controllers
{
    public class ParsePageRequest
    {
        public string PageId { get; set; }

        public string Title { get; set; }

        public string Html { get; set; }

        public string Text { get; set; }

        public string Module { get; set; }

        public bool? UseCommaDelimiter { get; set; }

        public bool? UpdateHtml { get; set; }

        public List<ParseParagraphRequest> Paragraphs { get; set; }
    }

    public class ParseParagraphRequest
    {
        public int? Index { get; set; }

        public string Path { get; set; }

        public string Html { get; set; }

        public string Text { get; set; }
    }

    public class ParsePageResponse
    {
        public string PageId { get; set; }

        public string Module { get; set; }

        public bool UseCommaDelimiter { get; set; }

        public string Html { get; set; }

        public List<ParseParagraphResponse> Paragraphs { get; set; }

        public List<VerseRelationResponse> Relations { get; set; }

        public bool RelationsCapped { get; set; }
    }

    public class ParseParagraphResponse
    {
        public int Index { get; set; }

        public string Path { get; set; }

        public string Text { get; set; }

        public int VersesCount { get; set; }

        public List<VerseReferenceResponse> References { get; set; }

        public List<VerseNotFoundResponse> NotFound { get; set; }
    }

    public class VerseReferenceResponse
    {
        public string OriginalText { get; set; }

        public string Normalized { get; set; }

        public int BookIndex { get; set; }

        public string BookName { get; set; }

        public string BookShortName { get; set; }

        public int Chapter { get; set; }

        public int Verse { get; set; }

        public int TopChapter { get; set; }

        public int TopVerse { get; set; }

        public bool IsChapter { get; set; }

        public int StartIndex { get; set; }

        public int EndIndex { get; set; }

        public string EntryType { get; set; }

        public string EntryOptions { get; set; }
    }

    public class VerseNotFoundResponse
    {
        public string Normalized { get; set; }

        public int BookIndex { get; set; }

        public int Chapter { get; set; }

        public int Verse { get; set; }

        public int TopChapter { get; set; }

        public int TopVerse { get; set; }

        public bool IsChapter { get; set; }
    }

    public class VerseRelationResponse
    {
        public int ParagraphIndex { get; set; }

        public int ReferenceIndex { get; set; }

        public long VerseId { get; set; }

        public int RelativeParagraphIndex { get; set; }

        public int RelativeReferenceIndex { get; set; }

        public long RelativeVerseId { get; set; }

        public decimal RelationWeight { get; set; }
    }

    public class VerseParsingHealthResponse
    {
        public string Status { get; set; }

        public string Module { get; set; }

        public string ModuleName { get; set; }

        public bool UseCommaDelimiter { get; set; }

        public string ModulesDirectory { get; set; }
    }

    public class UploadModuleRequest
    {
        public string FilePath { get; set; }

        public string ModuleName { get; set; }
    }

    public class UploadModuleResponse
    {
        public string ShortName { get; set; }

        public string DisplayName { get; set; }

        public string Type { get; set; }

        public string ModulesDirectory { get; set; }
    }

    public class ModuleResponse
    {
        public string ShortName { get; set; }

        public string DisplayName { get; set; }

        public string Type { get; set; }

        public string Locale { get; set; }

        public string Description { get; set; }

        public bool IsCurrent { get; set; }
    }

    public class BibleBookResponse
    {
        public int Index { get; set; }

        public string Name { get; set; }

        public string ShortName { get; set; }

        public int ChapterCount { get; set; }

        public List<int> Chapters { get; set; }
    }

    public class VerseTextRequest
    {
        public string Module { get; set; }

        public int BookIndex { get; set; }

        public string BookName { get; set; }

        public string BookShortName { get; set; }

        public string OriginalText { get; set; }

        public int Chapter { get; set; }

        public int Verse { get; set; }

        public int? TopChapter { get; set; }

        public int? TopVerse { get; set; }

        public int ContextVerses { get; set; }
    }

    public class VerseTextResponse
    {
        public string Module { get; set; }

        public string ModuleName { get; set; }

        public int BookIndex { get; set; }

        public string BookName { get; set; }

        public string BookShortName { get; set; }

        public int Chapter { get; set; }

        public int Verse { get; set; }

        public int? TopChapter { get; set; }

        public int? TopVerse { get; set; }

        public string Reference { get; set; }

        public string Text { get; set; }

        public List<VerseTextItemResponse> Verses { get; set; }
    }

    public class VerseTextItemResponse
    {
        public int Chapter { get; set; }

        public int Verse { get; set; }

        public int? TopVerse { get; set; }

        public string Reference { get; set; }

        public string Text { get; set; }

        public bool IsFullVerse { get; set; }

        public bool IsPartOfBigVerse { get; set; }

        public bool HasValueEvenIfEmpty { get; set; }
    }
}
