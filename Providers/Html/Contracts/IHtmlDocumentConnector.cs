﻿using BibleNote.Services.DocumentProvider.Contracts;

namespace BibleNote.Providers.Html.Contracts
{
    public interface IHtmlDocumentConnector : IDocumentConnector<IHtmlDocumentHandler>
    {        
    }
}
