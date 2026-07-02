using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Providers.Html;
using BibleNote.Providers.Web.DocumentId;
using BibleNote.Services.Contracts;
using BibleNote.Services.NavigationProvider;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Providers.Web.Navigation
{
    public class WebNavigationProvider : NavigationProviderBase<WebDocumentId, WebNavigationProviderParameters>
    {
        public override NavigationProviderType Type => NavigationProviderType.Web;
        public override int Id { get; set; }
        public override string Name { get; set; }
        public override string Description { get; set; }
        public override bool IsReadonly { get; set; }

        private readonly IServiceProvider scopeProvider;

        public WebNavigationProvider(IServiceProvider scopeProvider, ITrackingDbContext dbContext)
            : base(dbContext)
        {
            this.scopeProvider = scopeProvider;
            this.Parameters = new WebNavigationProviderParameters();
        }

        public override IDocumentProvider GetProvider(WebDocumentId document)
        {
            return this.scopeProvider.GetService<HtmlProvider>();
        }

        public override Task<IEnumerable<WebDocumentId>> LoadDocuments(
            AnalysisSession analysisSession, 
            bool newOnly, 
            bool updateDb = true, 
            CancellationToken cancellationToken = default)
        {
            throw new NotImplementedException(); // todo
        }
    }
}
