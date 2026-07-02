using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using BibleNote.Domain.Enums;
using BibleNote.Providers.Html;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;
using BibleNote.Services.VerseParsing;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Services.VerseParsing.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;
using HtmlAgilityPack;
using Microsoft.AspNetCore.Mvc;

namespace BibleNote.Application.Controllers
{
    public class VerseParsingController : BaseController
    {
        private static readonly object ParseLock = new object();

        private readonly IDocumentParserFactory documentParserFactory;
        private readonly IVerseLinkService verseLinkService;
        private readonly IConfigurationManager configurationManager;
        private readonly IApplicationManager applicationManager;
        private readonly IModulesManager modulesManager;

        public VerseParsingController(
            IDocumentParserFactory documentParserFactory,
            IVerseLinkService verseLinkService,
            IConfigurationManager configurationManager,
            IApplicationManager applicationManager,
            IModulesManager modulesManager)
        {
            this.documentParserFactory = documentParserFactory;
            this.verseLinkService = verseLinkService;
            this.configurationManager = configurationManager;
            this.applicationManager = applicationManager;
            this.modulesManager = modulesManager;
        }

        [HttpGet]
        public ActionResult<VerseParsingHealthResponse> Health()
        {
            var module = applicationManager.CurrentModuleInfo;
            return new VerseParsingHealthResponse
            {
                Status = "ok",
                Module = module.ShortName,
                ModuleName = module.DisplayName,
                UseCommaDelimiter = configurationManager.UseCommaDelimiter,
                ModulesDirectory = modulesManager.GetModulesDirectory()
            };
        }

        [HttpGet]
        public ActionResult<List<ModuleResponse>> Modules()
        {
            var currentModule = configurationManager.ModuleShortName;
            return modulesManager.GetModules(true)
                .OrderBy(module => module.DisplayName)
                .ThenBy(module => module.ShortName)
                .Select(module => new ModuleResponse
                {
                    ShortName = module.ShortName,
                    DisplayName = module.DisplayName,
                    Type = module.Type.ToString(),
                    Locale = module.Locale,
                    Description = module.Description,
                    IsCurrent = string.Equals(module.ShortName, currentModule, StringComparison.OrdinalIgnoreCase)
                })
                .ToList();
        }

        [HttpPost]
        public ActionResult<UploadModuleResponse> UploadModule([FromBody] UploadModuleRequest request)
        {
            if (request == null)
                return BadRequest("Request body is required.");

            if (string.IsNullOrWhiteSpace(request.FilePath))
                return BadRequest("filePath is required.");

            if (!System.IO.File.Exists(request.FilePath))
                return NotFound($"Module file '{request.FilePath}' was not found.");

            var moduleName = string.IsNullOrWhiteSpace(request.ModuleName)
                ? Path.GetFileNameWithoutExtension(request.FilePath)
                : request.ModuleName.Trim();
            if (string.IsNullOrWhiteSpace(moduleName))
                return BadRequest("moduleName is required.");

            if (moduleName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                return BadRequest("moduleName contains invalid file name characters.");

            try
            {
                var module = modulesManager.UploadModule(request.FilePath, moduleName);
                applicationManager.ReloadInfo();
                return new UploadModuleResponse
                {
                    ShortName = module.ShortName,
                    DisplayName = module.DisplayName,
                    Type = module.Type.ToString(),
                    ModulesDirectory = modulesManager.GetModulesDirectory()
                };
            }
            catch (Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }

        [HttpPost]
        public ActionResult<ParsePageResponse> ParsePage([FromBody] ParsePageRequest request)
        {
            if (request == null)
                return BadRequest("Request body is required.");

            var module = string.IsNullOrWhiteSpace(request.Module)
                ? configurationManager.ModuleShortName
                : request.Module.Trim();
            if (string.IsNullOrWhiteSpace(module))
                module = "rst";

            lock (ParseLock)
            {
                var previousModule = configurationManager.ModuleShortName;
                var previousUseCommaDelimiter = configurationManager.UseCommaDelimiter;

                try
                {
                    configurationManager.ModuleShortName = module;
                    configurationManager.UseCommaDelimiter = request.UseCommaDelimiter ?? configurationManager.UseCommaDelimiter;
                    applicationManager.ReloadInfo();

                    var documentId = new ParserDocumentId(0);
                    var provider = new ReadOnlyDocumentProviderInfo(verseLinkService);
                    var paragraphs = new List<ParagraphParseResult>();

                    using (var parser = documentParserFactory.Create(provider, documentId))
                    {
                        if (!string.IsNullOrWhiteSpace(request.Html))
                        {
                            ParseHtml(parser, request.Html, paragraphs);
                        }
                        else
                        {
                            if (!string.IsNullOrWhiteSpace(request.Title))
                            {
                                using (parser.ParseHierarchyElement(ElementType.Title))
                                {
                                    ParseParagraph(parser, HtmlFromText(request.Title), paragraphs);
                                }
                            }

                            var requestParagraphs = request.Paragraphs?.Where(p => p != null).ToList();
                            if (requestParagraphs?.Count > 0)
                            {
                                foreach (var paragraph in requestParagraphs)
                                {
                                    var paragraphHtml = !string.IsNullOrEmpty(paragraph.Html)
                                        ? paragraph.Html
                                        : HtmlFromText(paragraph.Text ?? string.Empty);
                                    ParseParagraph(parser, paragraphHtml, paragraphs);
                                }
                            }
                            else if (!string.IsNullOrWhiteSpace(request.Text))
                            {
                                foreach (var paragraph in SplitTextParagraphs(request.Text))
                                    ParseParagraph(parser, HtmlFromText(paragraph), paragraphs);
                            }
                            else
                            {
                                return BadRequest("Specify html, text, or paragraphs.");
                            }
                        }
                    }

                    return new ParsePageResponse
                    {
                        PageId = request.PageId,
                        Module = applicationManager.CurrentModuleInfo.ShortName,
                        UseCommaDelimiter = configurationManager.UseCommaDelimiter,
                        Paragraphs = paragraphs.Select(ToParagraphResponse).ToList()
                    };
                }
                finally
                {
                    configurationManager.ModuleShortName = previousModule;
                    configurationManager.UseCommaDelimiter = previousUseCommaDelimiter;
                    applicationManager.ReloadInfo();
                }
            }
        }

        [HttpGet]
        public ActionResult<VerseTextResponse> VerseText([FromQuery] VerseTextRequest request)
        {
            if (request == null)
                return BadRequest("Request query is required.");

            if (request.BookIndex < 1 || request.Chapter < 1 || request.Verse < 0)
                return BadRequest("bookIndex and chapter must be positive integers. verse must be omitted or positive.");

            var module = string.IsNullOrWhiteSpace(request.Module)
                ? configurationManager.ModuleShortName
                : request.Module.Trim();
            if (string.IsNullOrWhiteSpace(module))
                module = "rst";

            var bible = applicationManager.GetBibleContent(module);
            var moduleInfo = modulesManager.GetModuleInfo(module);
            if (!bible.BooksDictionary.TryGetValue(request.BookIndex, out var book))
                return NotFound($"Book {request.BookIndex} was not found in module '{module}'.");

            var bookInfo = moduleInfo.BibleStructure.BibleBooks.FirstOrDefault(item => item.Index == request.BookIndex);
            var bookName = bookInfo?.Name ?? book.bname;
            var bookShortName = bookInfo?.FriendlyShortName ?? book.bsname ?? bookName;
            var verses = GetVerseTexts(book, module, request);
            if (verses.Count == 0)
                return NotFound("Verse text was not found.");

            return new VerseTextResponse
            {
                Module = module,
                ModuleName = moduleInfo.DisplayName,
                BookIndex = request.BookIndex,
                BookName = bookName,
                BookShortName = bookShortName,
                Chapter = request.Chapter,
                Verse = request.Verse,
                TopChapter = request.TopChapter,
                TopVerse = request.TopVerse,
                Reference = FormatReference(bookShortName, request),
                Text = string.Join(Environment.NewLine, verses.Select(item => $"{item.Reference} {item.Text}")),
                Verses = verses
            };
        }

        private static List<VerseTextItemResponse> GetVerseTexts(BIBLEBOOK book, string module, VerseTextRequest request)
        {
            var result = new List<VerseTextItemResponse>();
            var topChapter = request.TopChapter.GetValueOrDefault(request.Chapter);
            if (request.ContextVerses > 0 && request.Verse > 0)
            {
                var context = Math.Min(request.ContextVerses, 100);
                var fromVerse = Math.Max(1, request.Verse - context);
                var chapterInfo = book.Chapters.FirstOrDefault(item => item.Index == request.Chapter);
                var toVerse = Math.Min(chapterInfo?.Verses.LastOrDefault()?.Index ?? request.Verse, request.Verse + context);
                for (var verse = fromVerse; verse <= toVerse; verse++)
                    AddVerseText(book, module, request.Chapter, verse, result);
                return result;
            }
            if (topChapter < request.Chapter)
                return result;

            var hasVerse = request.Verse > 0;
            if (!hasVerse)
            {
                AddChapterVerses(book, module, request.Chapter, result);
                return result;
            }

            for (var chapter = request.Chapter; chapter <= topChapter; chapter++)
            {
                var chapterInfo = book.Chapters.FirstOrDefault(item => item.Index == chapter);
                if (chapterInfo == null)
                    continue;

                var firstVerse = chapter == request.Chapter ? request.Verse : 1;
                var lastVerse = chapter == topChapter
                    ? request.TopVerse.GetValueOrDefault(chapter == request.Chapter ? request.Verse : chapterInfo.Verses.LastOrDefault()?.Index ?? 0)
                    : chapterInfo.Verses.LastOrDefault()?.Index ?? 0;

                for (var verse = firstVerse; verse <= lastVerse; verse++)
                    AddVerseText(book, module, chapter, verse, result);
            }

            return result;
        }

        private static void AddChapterVerses(BIBLEBOOK book, string module, int chapter, List<VerseTextItemResponse> result)
        {
            var chapterInfo = book.Chapters.FirstOrDefault(item => item.Index == chapter);
            if (chapterInfo == null)
                return;

            foreach (var verse in chapterInfo.Verses)
                AddVerseText(book, module, chapter, verse.Index, result);
        }

        private static void AddVerseText(BIBLEBOOK book, string module, int chapter, int verse, List<VerseTextItemResponse> result)
        {
            try
            {
                var pointer = new ModuleVersePointer(book.Index, chapter, verse);
                var text = book.GetVerseContent(
                    pointer,
                    module,
                    string.Empty,
                    false,
                    out var verseIndex,
                    out var isEmpty,
                    out var isFullVerse,
                    out var isPartOfBigVerse,
                    out var hasValueEvenIfEmpty);

                if (text == null || isEmpty)
                    return;

                result.Add(new VerseTextItemResponse
                {
                    Chapter = chapter,
                    Verse = verse,
                    TopVerse = verseIndex.TopIndex,
                    Reference = verseIndex.TopIndex.HasValue
                        ? $"{chapter}:{verseIndex.Index}-{verseIndex.TopIndex.Value}"
                        : $"{chapter}:{verseIndex.Index}",
                    Text = text,
                    IsFullVerse = isFullVerse,
                    IsPartOfBigVerse = isPartOfBigVerse,
                    HasValueEvenIfEmpty = hasValueEvenIfEmpty
                });
            }
            catch
            {
                // Missing verses are skipped so ranges can still return the verses that exist.
            }
        }

        private static string FormatReference(string bookShortName, VerseTextRequest request)
        {
            if (request.Verse <= 0)
                return $"{bookShortName} {request.Chapter}";

            var topChapter = request.TopChapter.GetValueOrDefault(request.Chapter);
            if (request.TopVerse.GetValueOrDefault(0) <= 0 || (topChapter == request.Chapter && request.TopVerse == request.Verse))
                return $"{bookShortName} {request.Chapter}:{request.Verse}";

            var top = topChapter == request.Chapter
                ? request.TopVerse.Value.ToString()
                : $"{topChapter}:{request.TopVerse.Value}";
            return $"{bookShortName} {request.Chapter}:{request.Verse}-{top}";
        }

        private static IEnumerable<string> SplitTextParagraphs(string text)
        {
            return text
                .Replace("\r\n", "\n")
                .Replace('\r', '\n')
                .Split('\n')
                .Select(p => p.Trim())
                .Where(p => p.Length > 0);
        }

        private static string HtmlFromText(string text)
        {
            return $"<p>{WebUtility.HtmlEncode(text)}</p>";
        }

        private static void ParseHtml(IDocumentParser parser, string html, List<ParagraphParseResult> paragraphs)
        {
            var htmlDocument = new HtmlDocument
            {
                GlobalAttributeValueQuote = AttributeValueQuote.DoubleQuote,
                OptionOutputOptimizeAttributeValues = false
            };
            htmlDocument.LoadHtml(html);
            ParseNode(parser, htmlDocument.DocumentNode, false, paragraphs);
        }

        private static void ParseNode(IDocumentParser parser, HtmlNode node, bool isReadonly, List<ParagraphParseResult> paragraphs)
        {
            var state = GetParagraphType(node);
            if (state.IsHierarchical())
            {
                using (parser.ParseHierarchyElement(state))
                {
                    if (IsHierarchy(node))
                    {
                        foreach (var childNode in node.ChildNodes)
                            ParseNode(parser, childNode, state == ElementType.Title || isReadonly, paragraphs);
                    }
                    else
                    {
                        ParseParagraph(parser, node, state == ElementType.Title || isReadonly, paragraphs);
                    }
                }
            }
            else
            {
                ParseParagraph(parser, node, isReadonly, paragraphs);
            }
        }

        private static void ParseParagraph(IDocumentParser parser, string html, List<ParagraphParseResult> paragraphs)
        {
            ParseParagraph(parser, new HtmlNodeWrapper(html), false, paragraphs);
        }

        private static void ParseParagraph(IDocumentParser parser, HtmlNode node, bool isReadonly, List<ParagraphParseResult> paragraphs)
        {
            ParseParagraph(parser, new HtmlNodeWrapper(node, isReadonly), isReadonly, paragraphs);
        }

        private static void ParseParagraph(IDocumentParser parser, HtmlNodeWrapper nodeWrapper, bool isReadonly, List<ParagraphParseResult> paragraphs)
        {
            if (nodeWrapper.HasChildNodes() || nodeWrapper.IsValuableTextNode(IXmlTextNodeMode.Exact))
            {
                var result = parser.ParseParagraph(nodeWrapper);
                if (!string.IsNullOrWhiteSpace(result.Text) || result.IsValuable)
                    paragraphs.Add(result);
            }
        }

        private static bool IsHierarchy(HtmlNode node)
        {
            return node.ChildNodes.Any(n =>
                n.NodeType != HtmlNodeType.Text
                && n.NodeType != HtmlNodeType.Comment
                && n.Name != HtmlTags.A);
        }

        private static ElementType GetParagraphType(HtmlNode node)
        {
            switch (node.Name)
            {
                case HtmlTags.Table:
                    return ElementType.Table;
                case HtmlTags.TableRow:
                    return ElementType.TableRow;
                case HtmlTags.Head:
                    if (node.ParentNode?.Name == HtmlTags.Html)
                        return ElementType.Title;
                    break;
            }

            if (HtmlTags.BlockElements.Contains(node.Name))
                return ElementType.HierarchicalBlock;

            if (HtmlTags.Lists.Contains(node.Name))
                return ElementType.List;

            if (HtmlTags.ListElements.Contains(node.Name))
                return ElementType.ListElement;

            if (HtmlTags.TableCells.Contains(node.Name))
                return ElementType.TableCell;

            if (HtmlTags.TableBodys.Contains(node.Name))
                return ElementType.TableBody;

            return ElementType.SimpleBlock;
        }

        private static ParseParagraphResponse ToParagraphResponse(ParagraphParseResult result)
        {
            return new ParseParagraphResponse
            {
                Index = result.ParagraphIndex,
                Path = result.ParagraphPath,
                Text = result.Text,
                VersesCount = result.VersesCount,
                References = result.VerseEntries.Select(ToReferenceResponse).ToList(),
                NotFound = result.NotFoundVerses.Select(ToNotFoundResponse).ToList()
            };
        }

        private static VerseReferenceResponse ToReferenceResponse(VerseEntry entry)
        {
            var pointer = entry.VersePointer;
            return new VerseReferenceResponse
            {
                OriginalText = pointer.GetOriginalVerseString(),
                Normalized = pointer.ToString(),
                BookIndex = pointer.BookIndex,
                BookName = pointer.Book?.Name,
                BookShortName = pointer.Book?.FriendlyShortName,
                Chapter = pointer.Chapter,
                Verse = pointer.Verse,
                TopChapter = pointer.MostTopChapter,
                TopVerse = pointer.MostTopVerse,
                IsChapter = pointer.IsChapter,
                StartIndex = entry.StartIndex,
                EndIndex = entry.EndIndex,
                EntryType = entry.EntryType.ToString(),
                EntryOptions = entry.EntryOptions.ToString()
            };
        }

        private static VerseNotFoundResponse ToNotFoundResponse(SimpleVersePointer pointer)
        {
            return new VerseNotFoundResponse
            {
                BookIndex = pointer.BookIndex,
                Chapter = pointer.Chapter,
                Verse = pointer.Verse,
                TopChapter = pointer.MostTopChapter,
                TopVerse = pointer.MostTopVerse,
                IsChapter = pointer.IsChapter,
                Normalized = pointer.ToString()
            };
        }

        private sealed class ParserDocumentId : IDocumentId
        {
            public ParserDocumentId(int documentId)
            {
                DocumentId = documentId;
            }

            public int DocumentId { get; }

            public bool Changed { get; private set; }

            public bool IsReadonly { get; private set; } = true;

            public void SetReadonly()
            {
                IsReadonly = true;
            }

            public void SetChanged()
            {
                Changed = true;
            }
        }

        private sealed class ReadOnlyDocumentProviderInfo : IDocumentProviderInfo
        {
            private readonly IVerseLinkService verseLinkService;

            public ReadOnlyDocumentProviderInfo(IVerseLinkService verseLinkService)
            {
                this.verseLinkService = verseLinkService;
            }

            public bool IsReadonly => true;

            public FileType[] SupportedFileTypes => new[] { FileType.Html, FileType.Text, FileType.OneNote };

            public string GetVersePointerLink(VersePointer versePointer)
            {
                return $"<a href='{verseLinkService.GetVerseLink(versePointer)}'>{WebUtility.HtmlEncode(versePointer.GetOriginalVerseString())}</a>";
            }
        }
    }

    public class ParsePageRequest
    {
        public string PageId { get; set; }

        public string Title { get; set; }

        public string Html { get; set; }

        public string Text { get; set; }

        public string Module { get; set; }

        public bool? UseCommaDelimiter { get; set; }

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

        public List<ParseParagraphResponse> Paragraphs { get; set; }
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

    public class VerseTextRequest
    {
        public string Module { get; set; }

        public int BookIndex { get; set; }

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
