using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Services.DocumentProvider.Contracts;
using Newtonsoft.Json;

namespace BibleNote.Services.NavigationProvider
{
    public abstract class NavigationProviderBase<T, P> : INavigationProvider<T>
        where T : IDocumentId
        where P : INavigationProviderParameters
    {
        public abstract string Name { get; set; }

        public abstract string Description { get; set; }

        public abstract bool IsReadonly { get; set; }

        public abstract P Parameters { get; set; }

        public string ParametersRaw
        {
            get => JsonConvert.SerializeObject(Parameters);
            set => Parameters = JsonConvert.DeserializeObject<P>(value);
        }

        public abstract IDocumentProvider GetProvider(T document);

        public abstract Task<IEnumerable<T>> LoadDocuments(bool newOnly, bool updateDb = true, CancellationToken cancellationToken = default);
    }
}
