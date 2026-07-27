using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services.DocumentProvider;
using BibleNote.Providers.OneNote.Services.Models;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using Microsoft.AspNetCore.Mvc;
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

    public class QuickAnalyzeCurrentPageResponse : OneNoteCurrentPageInfo
    {
        public bool PageUpdated { get; set; }

        public int TextLength { get; set; }

        public int VersesCount { get; set; }
    }
}
