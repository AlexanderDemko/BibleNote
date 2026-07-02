using AutoMapper;

namespace BibleNote.Infrastructure.AutoMapper
{
    public interface IHaveCustomMapping
    {
        void CreateMappings(Profile configuration);
    }
}
