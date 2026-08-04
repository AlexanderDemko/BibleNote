using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services.DocumentProvider;
using BibleNote.Providers.OneNote.Services.Models;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Office.Interop.OneNote;
using System.Threading.Tasks;

namespace BibleNote.Application.Controllers
{
    public class OneNoteIntegrationController : BaseController
    {
        private readonly IOneNoteAppWrapper oneNoteApp;
        private readonly OneNoteProvider oneNoteProvider;

        public OneNoteIntegrationController(
            IOneNoteAppWrapper oneNoteApp,
            OneNoteProvider oneNoteProvider)
        {
            this.oneNoteApp = oneNoteApp;
            this.oneNoteProvider = oneNoteProvider;
        }

        [HttpGet]
        public Task<OneNoteCurrentPageInfo> CurrentPage()
        {
            return oneNoteApp.GetCurrentPageInfoAsync();
        }

        [HttpGet]
        public async Task<ActionResult<OneNoteComContentResponse>> Hierarchy()
        {
            return new OneNoteComContentResponse
            {
                Xml = await oneNoteApp.GetHierarchyContentAsync(null, HierarchyScope.hsPages)
            };
        }

        [HttpGet]
        public async Task<ActionResult<OneNoteComContentResponse>> PageContent(string pageId)
        {
            if (string.IsNullOrWhiteSpace(pageId))
                return BadRequest("pageId is required.");

            return new OneNoteComContentResponse
            {
                Xml = await oneNoteApp.GetPageContentAsync(pageId, PageInfo.piBasic)
            };
        }

        [HttpGet]
        public async Task<ActionResult<OneNotePageLinkResponse>> PageLink(string pageId)
        {
            if (string.IsNullOrWhiteSpace(pageId))
                return BadRequest("pageId is required.");

            return new OneNotePageLinkResponse
            {
                ClientUrl = await oneNoteApp.GetHyperlinkToObjectAsync(pageId)
            };
        }

        [HttpPost]
        public async Task<ActionResult<QuickAnalyzeCurrentPageResponse>> QuickAnalyzeCurrentPage()
        {
            var currentPage = await oneNoteApp.GetCurrentPageInfoAsync();
            var documentId = new OneNoteDocumentId(0, currentPage.PageId);
            var parseResult = await oneNoteProvider.ParseDocumentAsync(documentId);

            return new QuickAnalyzeCurrentPageResponse
            {
                PageId = currentPage.PageId,
                ClientUrl = currentPage.ClientUrl,
                PageUpdated = documentId.Changed,
                TextLength = parseResult.TextLength,
                VersesCount = parseResult.VersesCount
            };
        }
    }

    public class OneNoteComContentResponse
    {
        public string Xml { get; set; }
    }

    public class OneNotePageLinkResponse
    {
        public string ClientUrl { get; set; }
    }

    public class QuickAnalyzeCurrentPageResponse : OneNoteCurrentPageInfo
    {
        public bool PageUpdated { get; set; }

        public int TextLength { get; set; }

        public int VersesCount { get; set; }
    }
}
