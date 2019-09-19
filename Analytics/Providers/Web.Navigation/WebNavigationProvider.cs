using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Providers.Web.DocumentId;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using System;
using System.Collections.Generic;
using Microsoft.Extensions.DependencyInjection;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.Web.Navigation
{
    public class WebNavigationProvider : INavigationProvider<WebDocumentId>
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public bool IsReadonly { get; set; }

        private readonly IServiceProvider scopeProvider;

        public WebNavigationProvider(IServiceProvider scopeProvider)
        {
            this.scopeProvider = scopeProvider;
        }

        public IDocumentProvider GetProvider(WebDocumentId document)
        {
            return new HtmlProvider(
                        this.scopeProvider.GetService<IDocumentParserFactory>(),
                        this.scopeProvider.GetService<IHtmlDocumentConnector>());
        }

        public async Task<IEnumerable<WebDocumentId>> GetDocuments(bool newOnly, CancellationToken cancellationToken = default)
        {
            throw new NotImplementedException();
        }
    }
}
